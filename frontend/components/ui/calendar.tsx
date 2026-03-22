"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import "react-day-picker/style.css";

export type CalendarProps = DayPickerProps;

const defaultModifiersClassNames: NonNullable<DayPickerProps["modifiersClassNames"]> = {
  selected:
    "!z-[1] rounded-md !bg-primary !font-semibold !text-primary-foreground shadow-md ring-2 ring-ring/70 ring-offset-2 ring-offset-popover",
  /** Today: soft ring + dot; when also selected, ring/dot match primary (see `selected`) */
  today:
    "relative rounded-md font-semibold text-foreground ring-1 ring-sky-500/60 ring-offset-1 ring-offset-popover dark:ring-sky-400/55 aria-selected:ring-2 aria-selected:ring-ring/60 aria-selected:ring-offset-2 after:pointer-events-none after:absolute after:bottom-0.5 after:left-1/2 after:z-[2] after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-sky-500 after:content-[''] dark:after:bg-sky-400 aria-selected:after:!bg-primary-foreground",
};

function Calendar({ className, classNames, showOutsideDays = true, modifiersClassNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      modifiersClassNames={{ ...defaultModifiersClassNames, ...modifiersClassNames }}
      classNames={{
        root: cn("w-fit rdp-root"),
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-4",
        month_caption: "relative mx-10 mb-1 flex h-8 items-center justify-center",
        caption_label: "text-sm font-medium",
        nav: "absolute top-0 flex w-full justify-between px-1",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "size-8 p-0 aria-disabled:opacity-40"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "size-8 p-0 aria-disabled:opacity-40"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground flex-1 select-none rounded-md text-[0.7rem] font-normal",
        week: "mt-2 flex w-full",
        day: "group/day relative aspect-square h-8 w-full flex-1 p-0 text-center text-sm [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-8 p-0 font-normal aria-selected:opacity-100"
        ),
        selected: "",
        today: "",
        outside: "text-muted-foreground/40 aria-selected:text-muted-foreground/40",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="size-4" {...chevronProps} />
          ) : (
            <ChevronRightIcon className="size-4" {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
