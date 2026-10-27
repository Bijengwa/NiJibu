import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

const SPRING = { useNativeDriver: true, damping: 24, stiffness: 240, mass: 0.9 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Draggable sheet with 3 positions: collapsed | half | expanded (like Bolt / Uber).
//   height   : height of the area the sheet lives in
//   visible  : { collapsed, half } visible heights in px (expanded = full height)
//   snap / onSnap : controlled position
//   floating : element shown just above the sheet (e.g. the "my location" button)
//   children : ({ snap, scrollProps }) => element  (spread scrollProps on the ScrollView)
export default function BottomSheet({ height, visible, snap, onSnap, floating, children }) {
  const { colors } = useSettings();

  const offsets = useMemo(
    () => ({
      collapsed: Math.max(0, height - visible.collapsed),
      half: Math.max(0, height - visible.half),
      expanded: 0,
    }),
    [height, visible.collapsed, visible.half]
  );

  const ty = useRef(new Animated.Value(offsets[snap])).current;
  const cur = useRef(offsets[snap]);
  const start = useRef(0);
  const scrollTop = useRef(0);
  const latest = useRef({});
  latest.current = { offsets, snap, onSnap };

  useEffect(() => {
    const id = ty.addListener(({ value }) => (cur.current = value));
    return () => ty.removeListener(id);
  }, [ty]);

  const animateTo = useCallback((y) => Animated.spring(ty, { toValue: y, ...SPRING }).start(), [ty]);

  useEffect(() => {
    animateTo(offsets[snap]);
  }, [snap, offsets, animateTo]);

  const pan = useRef(
    PanResponder.create({
      // Take over vertical drags. When fully open, only a pull-down from the top of the list closes it.
      onMoveShouldSetPanResponderCapture: (_, g) => {
        if (Math.abs(g.dy) < 8 || Math.abs(g.dy) < Math.abs(g.dx) * 1.2) return false;
        if (latest.current.snap !== 'expanded') return true;
        return scrollTop.current <= 0 && g.dy > 0;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = cur.current;
      },
      onPanResponderMove: (_, g) => {
        const o = latest.current.offsets;
        ty.setValue(clamp(start.current + g.dy, 0, o.collapsed));
      },
      onPanResponderRelease: (_, g) => {
        const { offsets: o, onSnap: change } = latest.current;
        const y = clamp(start.current + g.dy, 0, o.collapsed);
        const projected = y + g.vy * 220; // fling a bit further
        const target = Object.keys(o).reduce((best, k) =>
          Math.abs(projected - o[k]) < Math.abs(projected - o[best]) ? k : best
        );
        change(target);
        animateTo(o[target]);
      },
    })
  ).current;

  const scrollProps = {
    onScroll: (e) => {
      scrollTop.current = e.nativeEvent.contentOffset.y;
    },
    scrollEventThrottle: 16,
    scrollEnabled: snap === 'expanded',
    bounces: false,
    overScrollMode: 'never',
    keyboardShouldPersistTaps: 'handled',
    showsVerticalScrollIndicator: false,
  };

  return (
    <Animated.View
      style={[styles.sheet, { height, backgroundColor: colors.background, transform: [{ translateY: ty }] }]}
      {...pan.panHandlers}
    >
      {floating ? <View style={styles.floating} pointerEvents="box-none">{floating}</View> : null}
      <View style={styles.handleWrap}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </View>
      {children({ snap, scrollProps })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  floating: { position: 'absolute', top: -64, right: 16 },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 3 },
});
