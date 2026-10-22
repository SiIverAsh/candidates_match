import { useState, type FormEvent, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Filter } from "lucide-react";

interface ColumnPopoverProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  children: (close: () => void) => ReactNode;
}

function ColumnPopover({ label, active, disabled, children }: ColumnPopoverProps) {
  const [open, setOpen] = useState(false);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger className="column-filter-trigger" data-filtered={active || undefined} disabled={disabled} aria-label={`${label}筛选${active ? "（已筛选）" : ""}`}>
      {label}{active ? <Filter size={13} /> : <ChevronDown size={13} />}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner side="bottom" align="start" sideOffset={7} collisionPadding={12} className="column-filter-positioner">
        <Popover.Popup className="column-filter-popup">
          <Popover.Title className="column-filter-title">筛选{label}</Popover.Title>
          {children(() => setOpen(false))}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}

function FilterActions({ close, reset, invalid = false }: { close: () => void; reset: () => void; invalid?: boolean }) {
  return <>
    <button className="text-button column-filter-reset" type="button" onClick={reset}>清除此列筛选</button>
    <div className="column-filter-actions"><button className="secondary-link" type="button" onClick={close}>取消</button><button className="primary-button" type="submit" disabled={invalid}>确定</button></div>
  </>;
}

function TextFilterContent({ value, placeholder, onApply, close }: { value?: string; placeholder: string; onApply: (value?: string) => void; close: () => void }) {
  const [draft, setDraft] = useState(value ?? "");
  function submit(event: FormEvent) { event.preventDefault(); onApply(draft.trim() || undefined); }
  return <form onSubmit={submit}>
    <label className="column-filter-field">包含文字<input type="search" autoFocus maxLength={100} placeholder={placeholder} value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <p className="column-filter-help">留空时显示全部候选人。</p>
    <FilterActions close={close} reset={() => onApply(undefined)} />
  </form>;
}

export function TextColumnFilter({ label, value, onChange, disabled, placeholder = "输入部分姓名或编号" }: { label: string; value?: string; onChange: (value?: string) => void; disabled?: boolean; placeholder?: string }) {
  return <ColumnPopover label={label} active={Boolean(value)} disabled={disabled}>{close =>
    <TextFilterContent value={value} placeholder={placeholder} close={close} onApply={next => { onChange(next); close(); }} />
  }</ColumnPopover>;
}

export interface ColumnFilterOption<T extends string> { value: T; label: string }

function OptionFilterContent<T extends string>({ options, values, onApply, close }: { options: readonly ColumnFilterOption<T>[]; values?: readonly T[]; onApply: (values?: T[]) => void; close: () => void }) {
  const [selected, setSelected] = useState<T[]>(values ? [...values] : options.map(option => option.value));
  const all = options.every(option => selected.includes(option.value));
  function submit(event: FormEvent) { event.preventDefault(); onApply(all ? undefined : selected); }
  return <form onSubmit={submit}>
    <div className="column-filter-options">
      <label className="column-filter-select-all"><input type="checkbox" checked={all} aria-checked={!all && selected.length ? "mixed" : all} onChange={event => setSelected(event.target.checked ? options.map(option => option.value) : [])} />（全选）</label>
      {options.map(option => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={event => setSelected(current => event.target.checked ? [...current, option.value] : current.filter(value => value !== option.value))} />{option.label}</label>)}
    </div>
    {!selected.length ? <p className="column-filter-help">未选择任何值，应用后将不显示记录。</p> : null}
    <FilterActions close={close} reset={() => onApply(undefined)} />
  </form>;
}

export function OptionColumnFilter<T extends string>({ label, values, options, onChange, disabled }: { label: string; values?: readonly T[]; options: readonly ColumnFilterOption<T>[]; onChange: (values?: T[]) => void; disabled?: boolean }) {
  return <ColumnPopover label={label} active={values !== undefined} disabled={disabled}>{close =>
    <OptionFilterContent options={options} values={values} close={close} onApply={next => { onChange(next); close(); }} />
  }</ColumnPopover>;
}

interface DateFilterValue { from?: string; to?: string }

function DateFilterContent({ value, onApply, close }: { value: DateFilterValue; onApply: (value: DateFilterValue) => void; close: () => void }) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const invalid = Boolean(from && to && from > to);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!invalid) onApply({ from: from || undefined, to: to || undefined });
  }
  return <form onSubmit={submit}>
    <label className="column-filter-field">开始日期<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
    <label className="column-filter-field">结束日期<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
    <p className="column-filter-help">包含所选日期全天，以北京时间为准；留空表示不限日期。</p>
    {invalid ? <p className="form-error" role="alert">结束日期不能早于开始日期。</p> : null}
    <FilterActions close={close} reset={() => onApply({})} invalid={invalid} />
  </form>;
}

export function DateColumnFilter({ label, value, onChange, disabled }: { label: string; value: DateFilterValue; onChange: (value: DateFilterValue) => void; disabled?: boolean }) {
  return <ColumnPopover label={label} active={Boolean(value.from || value.to)} disabled={disabled}>{close =>
    <DateFilterContent value={value} close={close} onApply={next => { onChange(next); close(); }} />
  }</ColumnPopover>;
}
