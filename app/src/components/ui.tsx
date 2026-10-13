import * as Haptics from 'expo-haptics';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, space, type, useColors, useIsDark } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';
import { PressableScale } from './pressable-scale';

export function tap() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

type ScreenProps = ScrollViewProps & { children: ReactNode; padded?: boolean; underHeader?: boolean; bottomInset?: number };

export const Screen = forwardRef<ScrollView, ScreenProps>(function Screen(
  { children, contentContainerStyle, padded = true, underHeader = false, bottomInset, ...rest },
  ref,
) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const dark = useIsDark();
  return (
    <ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[
        {
          paddingTop: Platform.OS === 'ios' || underHeader ? space.sm : insets.top + space.md,
          paddingBottom: bottomInset ?? (Platform.OS === 'ios' ? space.xxxl + 40 : insets.bottom + 110),
        },
        padded && { paddingHorizontal: space.lg },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      indicatorStyle={dark ? 'white' : 'black'}
      {...rest}>
      {children}
    </ScrollView>
  );
});

export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Text style={[type.label, { color: c.textTertiary }]}>{eyebrow}</Text> : null}
        <Text style={[type.title, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, padded = true, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; onPress?: () => void }) {
  const c = useColors();
  const body = [styles.card, { backgroundColor: c.surface, borderColor: c.border }, padded && styles.cardPadded, style];
  if (onPress) {
    return (
      <PressableScale scaleTo={0.985} onPress={onPress} style={body} accessibilityRole="button">
        {children}
      </PressableScale>
    );
  }
  return <View style={body}>{children}</View>;
}

export function Label({ children, style, color }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string }) {
  const c = useColors();
  return <Text style={[type.label, { color: color ?? c.textTertiary }, style]}>{children}</Text>;
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[styles.sectionTitle, style]}>
      <Label>{title}</Label>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={action}>
          <Text style={[type.caption, { color: c.accentStrong }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink';

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  compact,
  large,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  large?: boolean;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    secondary: { bg: c.surface, fg: c.text, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.accentStrong, border: 'transparent' },
    danger: { bg: c.danger, fg: '#FFFFFF', border: 'transparent' },
    ink: { bg: 'rgba(255,255,255,0.12)', fg: '#FFFFFF', border: 'transparent' },
  }[variant];
  return (
    <PressableScale
      onPress={() => {
        if (disabled || loading) return;
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        large && styles.buttonLarge,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={large ? 20 : compact ? 15 : 17} color={palette.fg} /> : null}
          <Text style={[large ? type.headline : compact ? type.callout : type.bodyStrong, { color: palette.fg }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({ icon, onPress, label, tint, size = 40, style }: { icon: IconName; onPress: () => void; label: string; tint?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSunken }, style]}>
      <Icon name={icon} size={size * 0.45} color={tint ?? c.text} />
    </PressableScale>
  );
}

export function Row({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  value,
  onPress,
  right,
  destructive,
  first,
  last,
}: {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              tap();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: c.surfacePressed } : null]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconBg ?? c.accentSoft }]}>
          <Icon name={icon} size={17} color={iconColor ?? c.accentStrong} />
        </View>
      ) : null}
      <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderStrong }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: destructive ? c.danger : c.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={[type.callout, { color: c.textSecondary, maxWidth: '45%' }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {onPress && !right ? <Icon name="chevronRight" size={13} color={c.textTertiary} /> : null}
      </View>
    </Pressable>
  );
}

export function Group({ children, style, title, footer }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; footer?: string }) {
  const c = useColors();
  return (
    <View style={[{ marginBottom: space.xl }, style]}>
      {title ? <SectionTitle title={title} /> : null}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>
      {footer ? <Text style={[type.caption, { color: c.textTertiary, marginTop: space.sm, marginHorizontal: space.xs }]}>{footer}</Text> : null}
    </View>
  );
}

export function ToggleRow({ title, subtitle, value, onChange, icon, last }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; last?: boolean }) {
  const c = useColors();
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      last={last}
      right={
        <Switch
          value={value}
          onValueChange={(v) => {
            tap();
            onChange(v);
          }}
          trackColor={{ true: c.good, false: undefined }}
          thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : undefined) : undefined}
          accessibilityLabel={title}
        />
      }
    />
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surfaceSunken }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}>
            <Text style={[type.callout, { color: active ? c.text : c.textSecondary }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ text, color, bg, icon }: { text: string; color: string; bg: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={10} color={color} /> : null}
      <Text style={[type.caption, { color, fontFamily: fonts.semibold, fontSize: 11.5 }]}>{text}</Text>
    </View>
  );
}

export function Notice({ tone = 'info', icon, title, body, action, onAction }: { tone?: 'info' | 'warn' | 'danger' | 'good'; icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  const palette = {
    info: { fg: c.textSecondary, bg: c.surfaceSunken, icon: c.textSecondary },
    warn: { fg: c.text, bg: c.accentSoft, icon: c.accentStrong },
    danger: { fg: c.text, bg: c.dangerSoft, icon: c.danger },
    good: { fg: c.text, bg: c.goodSoft, icon: c.good },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      {icon ? <Icon name={icon} size={17} color={palette.icon} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, { color: palette.fg, fontFamily: fonts.semibold }]}>{title}</Text>
        {body ? <Text style={[type.caption, { color: c.textSecondary }]}>{body}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={[type.callout, { color: c.accentStrong, fontFamily: fonts.semibold }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.borderStrong }, style]} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md, marginBottom: space.lg, minHeight: 52 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardPadded: { padding: space.lg },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm, marginTop: space.xs, paddingHorizontal: space.xs },
  button: { height: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg, borderWidth: StyleSheet.hairlineWidth },
  buttonCompact: { height: 38, borderRadius: radius.sm + 2, paddingHorizontal: space.md },
  buttonLarge: { height: 60, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, minHeight: 54 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingRight: space.lg, minHeight: 54 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: radius.sm + 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', gap: space.md, padding: space.md + 2, borderRadius: radius.md, alignItems: 'flex-start' },
});
