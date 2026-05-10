import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode
} from 'react';
import { TrueSheet, type BackgroundBlur, type SheetDetent } from '@lodev09/react-native-true-sheet';
import { useTheme, radius } from '@/lib/theme';

/**
 * Pushr's drawer wrapper around `@lodev09/react-native-true-sheet`.
 *
 * Per the docs (https://sheet.lodev09.com), the recommended structure is
 * `<TrueSheet scrollable header={<HeaderEl />}><ScrollView/></TrueSheet>`.
 * `scrollable` lets the native side pin a ScrollView/FlatList to fit the
 * sheet, which avoids the flex-sizing pitfalls we hit doing it in JS.
 *
 * **Background**: defaults to the theme's `colors.sheet` so the drawer is
 * an opaque, themable surface. To opt into iOS-system glass on a specific
 * drawer, pass `backgroundBlur="system-thin-material"` and `backgroundColor={null}`.
 * For iOS 26+ Liquid Glass specifically, pass both as `null` (TrueSheet
 * uses Liquid Glass when neither prop is set).
 *
 * Usage:
 *   const ref = useRef<DrawerRef>(null);
 *   <Drawer ref={ref} header={<DrawerHeader title="..." />}>
 *     <ScrollView contentContainerStyle={...}>...</ScrollView>
 *   </Drawer>
 *   ref.current?.present();
 *
 * Inside the body, call `useDrawer()` to get `dismiss`.
 */

export type DrawerRef = {
  present: (index?: number) => Promise<void>;
  dismiss: () => Promise<void>;
};

export type DrawerProps = {
  /** Pinned top chrome — usually <DrawerHeader />. */
  header?: ReactElement;
  /** The scrollable body content. Must be a single ScrollView/FlatList. */
  children: ReactNode;
  /** Detents (heights). @default [1] (full height) */
  detents?: SheetDetent[];
  /** Callback after dismiss animation finishes. */
  onDismiss?: () => void;
  /** Sheet background color. Defaults to the theme's sheet color. Pass
   *  `null` to omit (required if you want glass / Liquid Glass). */
  backgroundColor?: string | null;
  /** Glass blur material. Defaults to none. Pass e.g. `"system-thin-material"`
   *  alongside `backgroundColor={null}` to enable a frosted-glass look. */
  backgroundBlur?: BackgroundBlur | null;
  /** Disable interactive dismissal. @default true */
  dismissible?: boolean;
};

type DrawerContextValue = {
  dismiss: () => Promise<void>;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    return { dismiss: async () => {} };
  }
  return ctx;
}

export const Drawer = forwardRef<DrawerRef, DrawerProps>(function Drawer(
  {
    header,
    children,
    detents = [1] as SheetDetent[],
    dismissible = true,
    onDismiss,
    backgroundColor,
    backgroundBlur
  },
  ref
) {
  const { colors } = useTheme();
  const sheetRef = useRef<TrueSheet>(null);

  // `undefined` -> use theme default. `null` -> explicitly omit (for glass).
  const resolvedBackgroundColor = backgroundColor === undefined ? colors.sheet : backgroundColor;

  const present = useCallback(
    (index = 0) => sheetRef.current?.present(index) ?? Promise.resolve(),
    []
  );
  const dismiss = useCallback(() => sheetRef.current?.dismiss() ?? Promise.resolve(), []);

  useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss]);

  const ctx = useMemo<DrawerContextValue>(() => ({ dismiss }), [dismiss]);

  // TrueSheet renders `header` as a sibling of `children`, so we have to
  // wrap both in the context provider — otherwise `useDrawer()` inside the
  // header gets the no-op default and the X button can't dismiss.
  const wrappedHeader = header ? (
    <DrawerContext.Provider value={ctx}>{header}</DrawerContext.Provider>
  ) : undefined;

  return (
    <TrueSheet
      ref={sheetRef}
      detents={detents}
      scrollable
      dismissible={dismissible}
      grabber={false}
      cornerRadius={radius.xl}
      {...(resolvedBackgroundColor ? { backgroundColor: resolvedBackgroundColor } : {})}
      {...(backgroundBlur ? { backgroundBlur } : {})}
      header={wrappedHeader}
      onDidDismiss={() => onDismiss?.()}
    >
      <DrawerContext.Provider value={ctx}>{children}</DrawerContext.Provider>
    </TrueSheet>
  );
});
