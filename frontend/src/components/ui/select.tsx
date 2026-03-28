"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const selectTriggerVariants = cva(
  "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      size: {
        default: "h-8",
        sm: "h-7 rounded-[min(var(--radius-md),10px)]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const selectContentVariants = cva(
  "relative isolate z-50 max-h-(--available-height) min-w-(--anchor-width) w-auto min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
  {
    variants: {
      alignTrigger: {
        true: "data-[align-trigger=true]:animate-none",
        false: "",
      },
    },
    defaultVariants: {
      alignTrigger: true,
    },
  }
)

const selectItemVariants = cva(
  "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2"
)

const selectScrollButtonVariants = cva(
  "z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      edge: {
        top: "top-0",
        bottom: "bottom-0",
      },
    },
  }
)

type SelectTriggerProps = SelectPrimitive.Trigger.Props &
  VariantProps<typeof selectTriggerVariants>

type SelectPopupPositionProps = Pick<
  SelectPrimitive.Positioner.Props,
  "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
>

type SelectContentProps = SelectPrimitive.Popup.Props & SelectPopupPositionProps

type SelectScrollArrowProps = React.ComponentProps<
  typeof SelectPrimitive.ScrollUpArrow
>

type SelectClassNameProp<State> =
  | string
  | ((state: State) => string | undefined)
  | undefined

function mergeSelectClassName<State>(
  baseClassName: string,
  className?: SelectClassNameProp<State>
) {
  if (typeof className === "function") {
    return (state: State) => cn(baseClassName, className(state))
  }

  return cn(baseClassName, className)
}

function getSelectSlotProps<State>(
  slot: string,
  baseClassName: string,
  className?: SelectClassNameProp<State>
) {
  return {
    "data-slot": slot,
    className: mergeSelectClassName(baseClassName, className),
  }
}

function createSelectScrollButton(
  slot: string,
  Primitive: typeof SelectPrimitive.ScrollUpArrow,
  Icon: React.ComponentType<React.ComponentProps<"svg">>,
  edge: VariantProps<typeof selectScrollButtonVariants>["edge"]
) {
  function SelectScrollButton({
    className,
    ...props
  }: SelectScrollArrowProps) {
    return (
      <Primitive
        {...getSelectSlotProps(
          slot,
          selectScrollButtonVariants({ edge }),
          className
        )}
        {...props}
      >
        <Icon />
      </Primitive>
    )
  }

  SelectScrollButton.displayName =
    slot === "select-scroll-up-button"
      ? "SelectScrollUpButton"
      : "SelectScrollDownButton"

  return SelectScrollButton
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      {...getSelectSlotProps("select-group", "scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

SelectGroup.displayName = "SelectGroup"

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      {...getSelectSlotProps("select-value", "flex flex-1 text-left", className)}
      {...props}
    />
  )
}

SelectValue.displayName = "SelectValue"

function SelectTrigger({
  className,
  size,
  children,
  ...props
}: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      {...getSelectSlotProps(
        "select-trigger",
        selectTriggerVariants({ size }),
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

SelectTrigger.displayName = "SelectTrigger"

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            selectContentVariants({
              alignTrigger: alignItemWithTrigger,
            }),
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

SelectContent.displayName = "SelectContent"

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      {...getSelectSlotProps(
        "select-label",
        "px-1.5 py-1 text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

SelectLabel.displayName = "SelectLabel"

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      {...getSelectSlotProps(
        "select-item",
        selectItemVariants(),
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

SelectItem.displayName = "SelectItem"

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      {...getSelectSlotProps(
        "select-separator",
        "pointer-events-none -mx-1 my-1 h-px bg-border",
        className
      )}
      {...props}
    />
  )
}

SelectSeparator.displayName = "SelectSeparator"

const SelectScrollUpButton = createSelectScrollButton(
  "select-scroll-up-button",
  SelectPrimitive.ScrollUpArrow,
  ChevronUpIcon,
  "top"
)

const SelectScrollDownButton = createSelectScrollButton(
  "select-scroll-down-button",
  SelectPrimitive.ScrollDownArrow,
  ChevronDownIcon,
  "bottom"
)

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
