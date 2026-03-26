import { App, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as amplify from "aws-cdk-lib/aws-amplify";

type InfraContext = {
  projectName: string;
  environmentName: string;
  enableAmplify: boolean;
  amplifyRepository: string;
  amplifyOauthTokenSecretArn: string;
  amplifyBranchName: string;
  allowedCorsOrigins: string;
};

class DevAppStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { cfg: InfraContext }) {
    super(scope, id, props);

    const { cfg } = props;
    const prefix = `${cfg.projectName}-${cfg.environmentName}`;

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, "EcsCluster", {
      vpc,
      clusterName: `${prefix}-cluster`,
    });

    const repository = new ecr.Repository(this, "BackendEcrRepository", {
      repositoryName: `${prefix}-backend`,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
    });

    const jobsTable = new dynamodb.Table(this, "JobsTable", {
      tableName: `${prefix}-assistant-jobs`,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });
    jobsTable.addGlobalSecondaryIndex({
      indexName: "gsi_createdAt",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const orchestratorTable = new dynamodb.Table(this, "OrchestratorTable", {
      tableName: `${prefix}-orchestrator-state`,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "entityType", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    const memoryTable = new dynamodb.Table(this, "MemoryTable", {
      tableName: `${prefix}-memory-entries`,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "memoryAt", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    const artifactsBucket = new s3.Bucket(this, "ArtifactsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
    });

    const openAiSecret = new secretsmanager.Secret(this, "OpenAiApiKeySecret", {
      secretName: `${prefix}/openai-api-key`,
      description: "OPENAI_API_KEY for backend runtime",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ value: "replace-me" }),
        generateStringKey: "placeholder",
      },
    });

    const cognitoUserPool = new cognito.UserPool(this, "CognitoUserPool", {
      userPoolName: `${prefix}-user-pool`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
    });

    const userPoolClient = cognitoUserPool.addClient("WebClient", {
      userPoolClientName: `${prefix}-web-client`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          implicitCodeGrant: true,
        },
        callbackUrls: ["http://localhost:3002"],
        logoutUrls: ["http://localhost:3002"],
      },
    });

    const domainPrefix = `${cfg.projectName}-${cfg.environmentName}`.toLowerCase().slice(0, 63);
    cognitoUserPool.addDomain("HostedUiDomain", {
      cognitoDomain: {
        domainPrefix,
      },
    });

    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "BackendService", {
      cluster,
      serviceName: `${prefix}-backend`,
      publicLoadBalancer: true,
      desiredCount: 1,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
        containerPort: 3001,
        environment: {
          NODE_ENV: "production",
          PORT: "3001",
          AUTH_REQUIRED: "true",
          CORS_ALLOWED_ORIGINS: cfg.allowedCorsOrigins,
          STATE_STORE_BACKEND: "dynamodb",
          JOBS_TABLE_NAME: jobsTable.tableName,
          ORCHESTRATOR_TABLE_NAME: orchestratorTable.tableName,
          MEMORY_TABLE_NAME: memoryTable.tableName,
          STATE_ARTIFACTS_BUCKET: artifactsBucket.bucketName,
          USER_PARTITION_KEY: "default",
          COGNITO_REGION: this.region,
          COGNITO_USER_POOL_ID: cognitoUserPool.userPoolId,
          COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
        },
        secrets: {
          OPENAI_API_KEY: ecs.Secret.fromSecretsManager(openAiSecret, "value"),
        },
      },
    });
    fargateService.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200",
    });

    const taskRole = fargateService.taskDefinition.taskRole;
    jobsTable.grantReadWriteData(taskRole);
    orchestratorTable.grantReadWriteData(taskRole);
    memoryTable.grantReadWriteData(taskRole);
    artifactsBucket.grantReadWrite(taskRole);
    openAiSecret.grantRead(taskRole);

    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: ["*"],
      })
    );

    if (cfg.enableAmplify && cfg.amplifyRepository && cfg.amplifyOauthTokenSecretArn) {
      const tokenSecret = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        "AmplifyOauthTokenSecret",
        cfg.amplifyOauthTokenSecretArn
      );

      const amplifyApp = new amplify.CfnApp(this, "AmplifyApp", {
        name: `${prefix}-frontend`,
        repository: cfg.amplifyRepository,
        accessToken: tokenSecret.secretValue.toString(),
        environmentVariables: [
          { name: "NEXT_PUBLIC_BACKEND_URL", value: `http://${fargateService.loadBalancer.loadBalancerDnsName}` },
          { name: "NEXT_PUBLIC_COGNITO_REGION", value: this.region },
          { name: "NEXT_PUBLIC_COGNITO_USER_POOL_ID", value: cognitoUserPool.userPoolId },
          { name: "NEXT_PUBLIC_COGNITO_CLIENT_ID", value: userPoolClient.userPoolClientId },
        ],
      });
      new amplify.CfnBranch(this, "AmplifyDevBranch", {
        appId: amplifyApp.attrAppId,
        branchName: cfg.amplifyBranchName,
        stage: "DEVELOPMENT",
        enableAutoBuild: true,
      });
    }

    new CfnOutput(this, "BackendEcrRepositoryUri", { value: repository.repositoryUri });
    new CfnOutput(this, "BackendAlbDnsName", { value: fargateService.loadBalancer.loadBalancerDnsName });
    new CfnOutput(this, "EcsClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "EcsServiceName", { value: fargateService.service.serviceName });
    new CfnOutput(this, "CognitoUserPoolId", { value: cognitoUserPool.userPoolId });
    new CfnOutput(this, "CognitoAppClientId", { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, "CognitoIssuer", {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${cognitoUserPool.userPoolId}`,
    });
    new CfnOutput(this, "JobsTableName", { value: jobsTable.tableName });
    new CfnOutput(this, "OrchestratorTableName", { value: orchestratorTable.tableName });
    new CfnOutput(this, "MemoryTableName", { value: memoryTable.tableName });
    new CfnOutput(this, "ArtifactsBucketName", { value: artifactsBucket.bucketName });
  }
}

const app = new App();
const cfg: InfraContext = {
  projectName: app.node.tryGetContext("projectName") ?? "shiel-assistant",
  environmentName: app.node.tryGetContext("environmentName") ?? "dev",
  enableAmplify: (app.node.tryGetContext("enableAmplify") ?? false) === true,
  amplifyRepository: app.node.tryGetContext("amplifyRepository") ?? "",
  amplifyOauthTokenSecretArn: app.node.tryGetContext("amplifyOauthTokenSecretArn") ?? "",
  amplifyBranchName: app.node.tryGetContext("amplifyBranchName") ?? "main",
  allowedCorsOrigins: app.node.tryGetContext("allowedCorsOrigins") ?? "",
};

new DevAppStack(app, "ShielAssistantDevStack", {
  cfg,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
