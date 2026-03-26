"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  /** @see https://wicg.github.io/speech-api/#speechrecognitionstate-enum */
  readonly state?: "idle" | "starting" | "running" | "stopping";
  start(): void;
  stop(): void;
  abort?(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";
const PREFERRED_SPEECH_MODE_STORAGE_KEY = "speech-input-preferred-mode";

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void;
  onSessionTranscription?: (text: string) => void;
  /**
   * Callback for when audio is recorded using MediaRecorder fallback.
   * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
   * The callback receives an audio Blob that should be sent to a transcription service.
   * Return the transcribed text, which will be passed to onTranscriptionChange.
   */
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
};

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") {
    return "none";
  }

  try {
    const preferred = window.localStorage.getItem(PREFERRED_SPEECH_MODE_STORAGE_KEY);
    if (preferred === "media-recorder" && canUseMediaRecorder()) {
      return "media-recorder";
    }
  } catch {
    // Ignore storage access failures (private mode / restricted storage).
  }

  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
    return "speech-recognition";
  }

  if ("MediaRecorder" in window && "mediaDevices" in navigator) {
    return "media-recorder";
  }

  return "none";
};

const canUseMediaRecorder = () =>
  typeof window !== "undefined" &&
  "MediaRecorder" in window &&
  "mediaDevices" in navigator;

export const SpeechInput = ({
  className,
  onTranscriptionChange,
  onSessionTranscription,
  onAudioRecorded,
  lang = "en-US",
  ...props
}: SpeechInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<SpeechInputMode>(detectSpeechInputMode);
  const [isRecognitionReady, setIsRecognitionReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  /** True between start() and onend/onerror; avoids double start() before React state catches up. */
  const speechSessionActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onTranscriptionChangeRef = useRef<
    SpeechInputProps["onTranscriptionChange"]
  >(onTranscriptionChange);
  const onSessionTranscriptionRef = useRef<
    SpeechInputProps["onSessionTranscription"]
  >(onSessionTranscription);
  const onAudioRecordedRef =
    useRef<SpeechInputProps["onAudioRecorded"]>(onAudioRecorded);
  const speechSessionTranscriptRef = useRef("");
  const shouldEmitSessionOnEndRef = useRef(false);
  const autoStartMediaFallbackRef = useRef(false);

  // Keep refs in sync
  onTranscriptionChangeRef.current = onTranscriptionChange;
  onSessionTranscriptionRef.current = onSessionTranscription;
  onAudioRecordedRef.current = onAudioRecorded;

  // Initialize Speech Recognition when mode is speech-recognition
  useEffect(() => {
    if (mode !== "speech-recognition") {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechRecognition = new SpeechRecognition();

    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = lang;

    const handleStart = () => {
      speechSessionActiveRef.current = true;
      shouldEmitSessionOnEndRef.current = true;
      speechSessionTranscriptRef.current = "";
      setIsListening(true);
    };

    const handleEnd = () => {
      speechSessionActiveRef.current = false;
      setIsListening(false);
      if (shouldEmitSessionOnEndRef.current) {
        const sessionTranscript = speechSessionTranscriptRef.current.trim();
        if (sessionTranscript) {
          onSessionTranscriptionRef.current?.(sessionTranscript);
        }
      }
      shouldEmitSessionOnEndRef.current = false;
      speechSessionTranscriptRef.current = "";
    };

    const handleResult = (event: Event) => {
      const speechEvent = event as SpeechRecognitionEvent;
      let finalTranscript = "";

      for (
        let i = speechEvent.resultIndex;
        i < speechEvent.results.length;
        i += 1
      ) {
        const result = speechEvent.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        }
      }

      if (finalTranscript) {
        speechSessionTranscriptRef.current = `${speechSessionTranscriptRef.current} ${finalTranscript}`.trim();
        onTranscriptionChangeRef.current?.(finalTranscript);
      }
    };

    const handleError = (event: Event) => {
      speechSessionActiveRef.current = false;
      shouldEmitSessionOnEndRef.current = false;
      speechSessionTranscriptRef.current = "";
      setIsListening(false);
      const err = event as SpeechRecognitionErrorEvent;
      if (
        (err.error === "network" ||
          err.error === "audio-capture" ||
          err.error === "not-allowed" ||
          err.error === "service-not-allowed") &&
        onAudioRecordedRef.current &&
        canUseMediaRecorder()
      ) {
        // Arc can expose SpeechRecognition but fail immediately with errors like
        // "network". Fall back to MediaRecorder + server transcription.
        autoStartMediaFallbackRef.current = true;
        try {
          window.localStorage.setItem(PREFERRED_SPEECH_MODE_STORAGE_KEY, "media-recorder");
        } catch {
          /* ignore storage failures */
        }
        setMode("media-recorder");
      }
      if (process.env.NODE_ENV === "development") {
        // Arc / Chromium: common values include not-allowed, aborted, network
        console.warn("[SpeechInput]", err.error ?? event.type);
      }
    };

    speechRecognition.addEventListener("start", handleStart);
    speechRecognition.addEventListener("end", handleEnd);
    speechRecognition.addEventListener("result", handleResult);
    speechRecognition.addEventListener("error", handleError);

    recognitionRef.current = speechRecognition;
    setIsRecognitionReady(true);

    return () => {
      speechSessionActiveRef.current = false;
      shouldEmitSessionOnEndRef.current = false;
      speechSessionTranscriptRef.current = "";
      speechRecognition.removeEventListener("start", handleStart);
      speechRecognition.removeEventListener("end", handleEnd);
      speechRecognition.removeEventListener("result", handleResult);
      speechRecognition.removeEventListener("error", handleError);
      try {
        speechRecognition.stop();
      } catch {
        /* already idle */
      }
      recognitionRef.current = null;
      setIsRecognitionReady(false);
    };
  }, [mode, lang]);

  // Cleanup MediaRecorder and stream on unmount
  useEffect(
    () => () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    },
    []
  );

  // Start MediaRecorder recording
  const startMediaRecorder = useCallback(async () => {
    if (!onAudioRecordedRef.current) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      const handleDataAvailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      const handleStop = async () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        if (audioBlob.size > 0 && onAudioRecordedRef.current) {
          setIsProcessing(true);
          try {
            const transcript = await onAudioRecordedRef.current(audioBlob);
            if (transcript) {
              onTranscriptionChangeRef.current?.(transcript);
              onSessionTranscriptionRef.current?.(transcript);
            }
          } catch {
            // Error handling delegated to the onAudioRecorded caller
          } finally {
            setIsProcessing(false);
          }
        }
      };

      const handleError = () => {
        setIsListening(false);
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      };

      mediaRecorder.addEventListener("dataavailable", handleDataAvailable);
      mediaRecorder.addEventListener("stop", handleStop);
      mediaRecorder.addEventListener("error", handleError);

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      setIsListening(false);
      if (process.env.NODE_ENV === "development") {
        console.warn("[SpeechInput] media-recorder start failed", err);
      }
    }
  }, []);

  useEffect(() => {
    if (mode !== "media-recorder" || !autoStartMediaFallbackRef.current) {
      return;
    }
    autoStartMediaFallbackRef.current = false;
    void startMediaRecorder();
  }, [mode, startMediaRecorder]);

  // Stop MediaRecorder recording
  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (mode === "speech-recognition" && recognitionRef.current) {
      const rec = recognitionRef.current;
      const apiRunning =
        typeof rec.state === "string"
          ? rec.state === "running" || rec.state === "starting"
          : speechSessionActiveRef.current;

      if (isListening || apiRunning) {
        try {
          rec.stop();
        } catch {
          speechSessionActiveRef.current = false;
          setIsListening(false);
        }
      } else {
        try {
          speechSessionActiveRef.current = true;
          rec.start();
        } catch (err) {
          speechSessionActiveRef.current = false;
          setIsListening(false);
          if (process.env.NODE_ENV === "development") {
            console.warn("[SpeechInput] start failed", err);
          }
        }
      }
    } else if (mode === "media-recorder") {
      if (isListening) {
        stopMediaRecorder();
      } else {
        startMediaRecorder();
      }
    }
  }, [mode, isListening, startMediaRecorder, stopMediaRecorder]);

  // Determine if button should be disabled
  const isDisabled =
    mode === "none" ||
    (mode === "speech-recognition" && !isRecognitionReady) ||
    (mode === "media-recorder" && !onAudioRecorded) ||
    isProcessing;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Animated pulse rings */}
      {isListening &&
        [0, 1, 2].map((index) => (
          <div
            className="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
            key={index}
            style={{
              animationDelay: `${index * 0.3}s`,
              animationDuration: "2s",
            }}
          />
        ))}

      {/* Main record button */}
      <Button
        className={cn(
          "relative z-10 rounded-full transition-all duration-300",
          isListening
            ? "bg-destructive text-white hover:bg-destructive/80 hover:text-white"
            : "bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground",
          className
        )}
        disabled={isDisabled}
        onClick={toggleListening}
        {...props}
      >
        {isProcessing && <Loader2Icon className="size-4 animate-spin" />}
        {!isProcessing && isListening && <SquareIcon className="size-4" />}
        {!(isProcessing || isListening) && <MicIcon className="size-4" />}
      </Button>
    </div>
  );
};
