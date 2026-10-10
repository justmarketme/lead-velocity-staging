import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* shadcn-style Button, restyled with SortMyCover tokens (amber pill, 52px touch target). */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-extrabold no-underline transition-[filter] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-progress",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-105",
        outline: "border-2 border-[var(--ctl)] bg-transparent text-foreground",
        ghost: "bg-transparent text-foreground underline",
      },
      size: { default: "min-h-[52px] px-6 py-3 text-[17px]", sm: "min-h-[44px] px-4 py-2 text-[15px]" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
});
Button.displayName = "Button";
