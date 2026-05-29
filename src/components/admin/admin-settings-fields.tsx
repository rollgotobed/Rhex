"use client"

import type { ReactNode } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      {title || description || action ? (
        <CardHeader className="border-b">
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className="space-y-4 py-4">{children}</CardContent>
    </Card>
  )
}

export function SettingsInputField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  min,
  max,
  step,
  description,
  required = false,
  className,
  inputClassName,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  type?: React.HTMLInputTypeAttribute
  min?: string | number
  max?: string | number
  step?: string | number
  description?: string
  required?: boolean
  className?: string
  inputClassName?: string
}) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-sm font-medium">{label}{required ? " *" : ""}</span>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        required={required}
        className={cn("h-11 rounded-xl bg-background px-4 text-sm", inputClassName)}
      />
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
    </label>
  )
}

export function SettingsTextareaField({
  label,
  value,
  onChange,
  placeholder,
  description,
  className,
  rows = 5,
  readOnly = false,
  textareaClassName,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
  className?: string
  rows?: number
  readOnly?: boolean
  textareaClassName?: string
}) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-sm font-medium">{label}</span>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        readOnly={readOnly}
        className={cn("rounded-2xl bg-background px-4 py-3 text-sm", textareaClassName)}
      />
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
    </label>
  )
}

export function SettingsSelectField({
  label,
  value,
  onChange,
  options,
  description,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  description?: string
  className?: string
}) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 rounded-xl bg-background px-4 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
    </label>
  )
}

export function SettingsToggleField({
  label,
  checked,
  onChange,
  description,
  className,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
  className?: string
}) {
  return (
    <label className={cn("flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3", className)}>
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(Boolean(value))}
        className="mt-0.5"
      />
    </label>
  )
}

export function AdminBooleanSelectField({
  label,
  checked,
  onChange,
  description,
  className,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  description?: string
  className?: string
}) {
  return (
    <SettingsSelectField
      label={label}
      value={checked ? "on" : "off"}
      onChange={(value) => onChange(value === "on")}
      options={[
        { value: "on", label: "开启" },
        { value: "off", label: "关闭" },
      ]}
      description={description}
      className={className}
    />
  )
}
