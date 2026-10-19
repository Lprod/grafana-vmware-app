import React from 'react';
import { DisplayValue } from '@grafana/data';
import { TableCellDisplayMode } from '@grafana/schema';
import { CustomCellRendererProps, useTheme2 } from '@grafana/ui';
import usageLowIcon from '../img/usage-low.png';
import usageMedIcon from '../img/usage-med.png';
import usageHighIcon from '../img/usage-high.png';
import { UsageTier, usageTierFromPercent } from './designSystem';

const TIER_ICON: Record<Exclude<UsageTier, 'unknown'>, string> = {
  low: usageLowIcon,
  med: usageMedIcon,
  high: usageHighIcon,
};

export function usageColorFromTier(theme: ReturnType<typeof useTheme2>, tier: UsageTier) {
  switch (tier) {
    case 'high':
      return theme.visualization.getColorByName('red');
    case 'med':
      return theme.visualization.getColorByName('orange');
    case 'low':
      return theme.visualization.getColorByName('green');
    default:
      return theme.visualization.getColorByName('grey');
  }
}

// field.display() splits a formatted value into text + prefix/suffix (e.g.
// the unit lives in `suffix`, not `text`), so callers must stitch these back
// together themselves.
export function formatDisplay(display: DisplayValue | { text: string; prefix?: string; suffix?: string }) {
  return `${display.prefix ?? ''}${display.text}${display.suffix ?? ''}`;
}

// Plain (untinted) icon - the PNG's own colors are used as-is.
export function UsageIcon({ tier, size = 14 }: { tier: UsageTier; size?: number }) {
  if (tier === 'unknown') {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: '#8E8E8E',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <img
      src={TIER_ICON[tier]}
      alt={`${tier} usage`}
      width={size}
      height={size}
      style={{ display: 'inline-block', flexShrink: 0 }}
    />
  );
}

// Combined meter cell for this app's percent columns (CPU %, RAM %, CPU
// Ready %): the formatted value, tier-colored, over a thin proportional bar
// underneath - debeka-k8s-app's signature "value + color + bar" table
// pattern (`requestUsageCell`), adapted for a column that's already a
// percentage itself rather than a value/percent column pair.
export function UsagePercentCell({ field, value }: CustomCellRendererProps) {
  const theme = useTheme2();
  const percent = typeof value === 'number' ? value : null;
  const tier = usageTierFromPercent(percent);
  const color = usageColorFromTier(theme, tier);
  const display = field.display ? field.display(value) : { text: String(value ?? '') };
  const barWidth = Math.max(0, Math.min(100, percent ?? 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '4px 0' }}>
      <span style={{ color, fontWeight: 500 }}>{formatDisplay(display)}</span>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: theme.colors.background.secondary,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width: `${barWidth}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// Field-override shorthand for wiring a custom cell renderer onto a Table
// panel column: `.overrideCustomFieldConfig('cellOptions', customCellOptions(UsagePercentCell))`.
export function customCellOptions(cellComponent: React.FC<CustomCellRendererProps>) {
  return { type: TableCellDisplayMode.Custom as const, cellComponent };
}
