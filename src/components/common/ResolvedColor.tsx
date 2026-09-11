import type { ReactNode } from "react";
import { useResolvedColor } from "../../data/colorResolve";

interface ResolvedColorProps {
  value?: string;
  children: (hex: string | undefined) => ReactNode;
}

/** 解析色彩值（字面色碼或色票參照）後透過 render-prop 提供給子內容，讓色票修改時自動連動更新 */
export default function ResolvedColor({ value, children }: ResolvedColorProps) {
  const hex = useResolvedColor(value);
  return <>{children(hex)}</>;
}
