/* eslint-disable react-hooks/exhaustive-deps */

'use client';

import * as React from 'react';
import { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

// Types
type StepperOrientation = 'horizontal' | 'vertical';
type StepState = 'active' | 'completed' | 'inactive' | 'loading';
type StepIndicators = {
  active?: React.ReactNode;
  completed?: React.ReactNode;
  inactive?: React.ReactNode;
  loading?: React.ReactNode;
};

interface StepperContextValue {
  activeStep: number;
  setActiveStep: (step: number) => void;
  stepsCount: number;
  orientation: StepperOrientation;
  registerTrigger: (node: HTMLButtonElement | null) => void;
  unregisterTrigger: (node: HTMLButtonElement | null) => void;
  triggerNodes: HTMLButtonElement[];
  focusNext: (currentIdx: number) => void;
  focusPrev: (currentIdx: number) => void;
  focusFirst: () => void;
  focusLast: () => void;
  indicators: StepIndicators;
}

interface StepItemContextValue {
  step: number;
  state: StepState;
  isDisabled: boolean;
  isLoading: boolean;
}

const StepperContext = createContext<StepperContextValue | undefined>(undefined);
const StepItemContext = createContext<StepItemContextValue | undefined>(undefined);

function useStepper() {
  const ctx = useContext(StepperContext);
  if (!ctx) throw new Error('useStepper must be used within a Stepper');
  return ctx;
}

function useStepItem() {
  const ctx = useContext(StepItemContext);
  if (!ctx) throw new Error('useStepItem must be used within a StepperItem');
  return ctx;
}

interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  orientation?: StepperOrientation;
  indicators?: StepIndicators;
}

function Stepper({
  defaultValue = 1,
  value,
  onValueChange,
  orientation = 'horizontal',
  className,
  children,
  indicators = {},
  ...props
}: StepperProps) {
  const [activeStep, setActiveStep] = React.useState(defaultValue);
  const [triggerNodes, setTriggerNodes] = React.useState<HTMLButtonElement[]>([]);

  // Register/unregister triggers
  const registerTrigger = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    setTriggerNodes((prev) => (prev.includes(node) ? prev : [...prev, node]));
  }, []);

  const unregisterTrigger = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    setTriggerNodes((prev) => prev.filter((n) => n !== node));
  }, []);

  const handleSetActiveStep = React.useCallback(
    (step: number) => {
      if (value === undefined) {
        setActiveStep(step);
      }
      onValueChange?.(step);
    },
    [value, onValueChange],
  );

  const currentStep = value ?? activeStep;

  // Keyboard navigation logic
  const focusTrigger = React.useCallback((idx: number) => {
    triggerNodes[idx]?.focus();
  }, [triggerNodes]);

  const focusNext = React.useCallback((currentIdx: number) => 
    focusTrigger((currentIdx + 1) % triggerNodes.length), 
  [focusTrigger, triggerNodes.length]);

  const focusPrev = React.useCallback((currentIdx: number) => 
    focusTrigger((currentIdx - 1 + triggerNodes.length) % triggerNodes.length),
  [focusTrigger, triggerNodes.length]);

  const focusFirst = React.useCallback(() => focusTrigger(0), [focusTrigger]);
  const focusLast = React.useCallback(() => focusTrigger(triggerNodes.length - 1), [focusTrigger, triggerNodes.length]);

  const stepsCount = React.Children.toArray(children).filter(
    (child): child is React.ReactElement =>
      React.isValidElement(child) && (child.type as React.ComponentType).displayName === 'StepperItem',
  ).length;

  // Context value
  const contextValue = React.useMemo<StepperContextValue>(
    () => ({
      activeStep: currentStep,
      setActiveStep: handleSetActiveStep,
      stepsCount,
      orientation,
      registerTrigger,
      unregisterTrigger,
      focusNext,
      focusPrev,
      focusFirst,
      focusLast,
      triggerNodes,
      indicators,
    }),
    [
      currentStep, 
      handleSetActiveStep, 
      stepsCount, 
      orientation, 
      registerTrigger, 
      unregisterTrigger, 
      focusNext, 
      focusPrev, 
      focusFirst, 
      focusLast, 
      triggerNodes, 
      indicators
    ],
  );

  return (
    <StepperContext.Provider value={contextValue}>
      <div
        role="tablist"
        aria-orientation={orientation}
        data-slot="stepper"
        className={cn('w-full', className)}
        data-orientation={orientation}
        {...props}
      >
        {children}
      </div>
    </StepperContext.Provider>
  );
}

interface StepperItemProps extends React.HTMLAttributes<HTMLDivElement> {
  step: number;
  completed?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

function StepperItem({
  step,
  completed = false,
  disabled = false,
  loading = false,
  className,
  children,
  ...props
}: StepperItemProps) {
  const { activeStep } = useStepper();

  const state: StepState = completed || step < activeStep ? 'completed' : activeStep === step ? 'active' : 'inactive';

  const isLoading = loading && step === activeStep;

  return (
    <StepItemContext.Provider value={{ step, state, isDisabled: disabled, isLoading }}>
      <div
        data-slot="stepper-item"
        className={cn(
          'group/step flex items-center justify-center group-data-[orientation=horizontal]/stepper-nav:flex-row group-data-[orientation=vertical]/stepper-nav:flex-col not-last:flex-1',
          className,
        )}
        data-state={state}
        {...(isLoading ? { 'data-loading': true } : {})}
        {...props}
      >
        {children}
      </div>
    </StepItemContext.Provider>
  );
}
StepperItem.displayName = 'StepperItem';

interface StepperTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

function StepperTrigger({ asChild = false, className, children, tabIndex, ...props }: StepperTriggerProps) {
  const { state, isLoading, step, isDisabled } = useStepItem();
  const { 
    setActiveStep, 
    activeStep, 
    registerTrigger, 
    unregisterTrigger, 
    triggerNodes, 
    focusNext, 
    focusPrev, 
    focusFirst, 
    focusLast 
  } = useStepper();
  
  const isSelected = activeStep === step;
  const id = `stepper-tab-${step}`;
  const panelId = `stepper-panel-${step}`;

  const btnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const node = btnRef.current;
    if (node) {
      registerTrigger(node);
      return () => unregisterTrigger(node);
    }
  }, [registerTrigger, unregisterTrigger]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const myIdx = triggerNodes.indexOf(e.currentTarget);
    if (myIdx === -1) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusNext(myIdx);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusPrev(myIdx);
        break;
      case 'Home':
        e.preventDefault();
        focusFirst();
        break;
      case 'End':
        e.preventDefault();
        focusLast();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        setActiveStep(step);
        break;
    }
  };

  if (asChild) {
    return (
      <span data-slot="stepper-trigger" data-state={state} className={className}>
        {children}
      </span>
    );
  }

  return (
    <button
      ref={btnRef}
      role="tab"
      id={id}
      type="button"
      aria-selected={isSelected}
      aria-controls={panelId}
      tabIndex={typeof tabIndex === 'number' ? tabIndex : isSelected ? 0 : -1}
      data-slot="stepper-trigger"
      data-state={state}
      data-loading={isLoading}
      className={cn(
        'cursor-pointer focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center gap-3 rounded-full outline-none focus-visible:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
      onClick={() => setActiveStep(step)}
      onKeyDown={handleKeyDown}
      disabled={isDisabled}
      {...props}
    >
      {children}
    </button>
  );
}

function StepperIndicator({ children, className }: React.ComponentProps<'div'>) {
  const { state, isLoading } = useStepItem();
  const { indicators } = useStepper();

  return (
    <div
      data-slot="stepper-indicator"
      data-state={state}
      className={cn(
        'relative flex items-center overflow-hidden justify-center size-6 shrink-0 border-background bg-accent text-accent-foreground rounded-full text-xs data-[state=completed]:bg-primary data-[state=completed]:text-primary-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
        className,
      )}
    >
      <div className="absolute">
        {indicators &&
        ((isLoading && indicators.loading) ||
          (state === 'completed' && indicators.completed) ||
          (state === 'active' && indicators.active) ||
          (state === 'inactive' && indicators.inactive))
          ? (isLoading && indicators.loading) ||
            (state === 'completed' && indicators.completed) ||
            (state === 'active' && indicators.active) ||
            (state === 'inactive' && indicators.inactive)
          : children}
      </div>
    </div>
  );
}

function StepperSeparator({ className }: React.ComponentProps<'div'>) {
  const { state } = useStepItem();

  return (
    <div
      data-slot="stepper-separator"
      data-state={state}
      className={cn(
        'm-0.5 rounded-full bg-muted group-data-[orientation=vertical]/stepper-nav:h-12 group-data-[orientation=vertical]/stepper-nav:w-0.5 group-data-[orientation=horizontal]/stepper-nav:h-0.5 group-data-[orientation=horizontal]/stepper-nav:flex-1',
        className,
      )}
    />
  );
}

function StepperTitle({ children, className }: React.ComponentProps<'h3'>) {
  const { state } = useStepItem();

  return (
    <h3 data-slot="stepper-title" data-state={state} className={cn('text-sm font-medium leading-none', className)}>
      {children}
    </h3>
  );
}

function StepperDescription({ children, className }: React.ComponentProps<'div'>) {
  const { state } = useStepItem();

  return (
    <div data-slot="stepper-description" data-state={state} className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </div>
  );
}

function StepperNav({ children, className }: React.ComponentProps<'nav'>) {
  const { activeStep, orientation } = useStepper();

  return (
    <nav
      data-slot="stepper-nav"
      data-state={activeStep}
      data-orientation={orientation}
      className={cn(
        'group/stepper-nav inline-flex data-[orientation=horizontal]:w-full data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col',
        className,
      )}
    >
      {children}
    </nav>
  );
}

function StepperPanel({ children, className }: React.ComponentProps<'div'>) {
  const { activeStep } = useStepper();

  return (
    <div data-slot="stepper-panel" data-state={activeStep} className={cn('w-full', className)}>
      {children}
    </div>
  );
}

interface StepperContentProps extends React.ComponentProps<'div'> {
  value: number;
  forceMount?: boolean;
}

function StepperContent({ value, forceMount, children, className }: StepperContentProps) {
  const { activeStep } = useStepper();
  const isActive = value === activeStep;

  if (!forceMount && !isActive) {
    return null;
  }

  return (
    <div
      data-slot="stepper-content"
      data-state={activeStep}
      className={cn('w-full', className, !isActive && forceMount && 'hidden')}
      hidden={!isActive && forceMount}
    >
      {children}
    </div>
  );
}

export {
  useStepper,
  useStepItem,
  Stepper,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperSeparator,
  StepperTitle,
  StepperDescription,
  StepperPanel,
  StepperContent,
  StepperNav,
  type StepperProps,
  type StepperItemProps,
  type StepperTriggerProps,
  type StepperContentProps,
};
