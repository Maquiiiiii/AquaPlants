import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import './BranchedMenu.css';

export interface BranchedMenuChild<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

export interface BranchedMenuItem<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  defaultOpen?: boolean;
  dividerBefore?: boolean;
  children?: BranchedMenuChild<T>[];
}

export interface BranchedMenuProps<T extends string = string> {
  items: BranchedMenuItem<T>[];
  activeValue: T;
  onSelect: (value: T) => void;
  drawDuration?: number;
  trunk?: number;
  indent?: number;
  className?: string;
}

interface BranchGroupProps<T extends string> {
  item: BranchedMenuItem<T>;
  isOpen: boolean;
  onToggle: () => void;
  activeValue: T;
  onSelect: (value: T) => void;
  drawDuration: number;
  trunk: number;
  indent: number;
}

const EMPTY_CHILDREN: readonly BranchedMenuChild<never>[] = [];

function BranchGroup<T extends string>({
  item,
  isOpen,
  onToggle,
  activeValue,
  onSelect,
  drawDuration,
  trunk,
  indent,
}: BranchGroupProps<T>) {
  const gradId = useId();
  const subRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const children = item.children ?? (EMPTY_CHILDREN as readonly BranchedMenuChild<T>[]);

  const [centers, setCenters] = useState<number[]>(() =>
    children.map((_, idx) => 6 + idx * 44 + 20),
  );
  const [svgHeight, setSvgHeight] = useState<number>(
    () => Math.max(48, children.length * 44 + 10),
  );

  useEffect(() => {
    const container = subRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const measure = () => {
      const nextCenters = children.map((_, idx) => {
        const btn = itemRefs.current[idx];
        if (!btn) {
          return 6 + idx * 44 + 20;
        }
        return btn.offsetTop + btn.offsetHeight / 2;
      });
      const nextHeight = Math.max(container.offsetHeight, 44);

      setCenters((prev) => {
        if (
          prev.length === nextCenters.length &&
          prev.every((v, i) => Math.abs(v - nextCenters[i]) < 0.5)
        ) {
          return prev;
        }
        return nextCenters;
      });

      setSvgHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
    };

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(container);
    itemRefs.current.forEach((btn) => {
      if (btn) observer.observe(btn);
    });

    return () => {
      observer.disconnect();
    };
  }, [children]);

  const hasActiveChild = children.some((c) => c.value === activeValue);
  const HeadIcon = item.icon;
  const lastCenter = centers[centers.length - 1] ?? 26;
  const lastStartY = Math.max(4, lastCenter - 13);
  const endX = indent - 10;

  const trunkPath = `M ${trunk} 2 C ${(trunk - 0.6).toFixed(1)} ${(lastStartY * 0.42).toFixed(
    1,
  )}, ${(trunk + 0.6).toFixed(1)} ${(lastStartY * 0.74).toFixed(
    1,
  )}, ${trunk} ${lastStartY.toFixed(1)}`;

  const cssVars = {
    '--bm-draw-duration': `${drawDuration}ms`,
  } as CSSProperties;

  return (
    <div className="branched-menu__group" style={cssVars}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        data-open={isOpen ? 'true' : 'false'}
        data-active={hasActiveChild ? 'true' : 'false'}
        className="branched-menu__head"
      >
        {HeadIcon && <HeadIcon className="branched-menu__head-icon" strokeWidth={1.8} />}
        <span className="branched-menu__label">{item.label}</span>
        {typeof item.badge === 'number' && item.badge > 0 && (
          <span className="branched-menu__badge">{item.badge}</span>
        )}
        <ChevronDown className="branched-menu__chevron" strokeWidth={1.8} />
      </button>

      <div
        className="branched-menu__collapse"
        data-open={isOpen ? 'true' : 'false'}
        aria-hidden={!isOpen}
      >
        <div className="branched-menu__collapse-inner">
          <div ref={subRef} className="branched-menu__sub">
            <svg
              className="branched-menu__lines"
              viewBox={`0 0 ${indent} ${svgHeight}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id={gradId}
                  x1={trunk}
                  y1="0"
                  x2={endX}
                  y2={svgHeight}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#34D399" />
                  <stop offset="100%" stopColor="#22C55E" />
                </linearGradient>
              </defs>

              {/* Tallo vegetal principal inactivo */}
              <path d={trunkPath} className="branched-menu__branch-idle" />

              {/* Brotes Bézier inactivos hacia cada sub-ítem */}
              {children.map((child, idx) => {
                const cy = centers[idx] ?? 6 + idx * 44 + 20;
                const startY = Math.max(2, cy - 13);
                const shootPath = `M ${trunk} ${startY.toFixed(1)} C ${trunk} ${(
                  cy - 3.5
                ).toFixed(1)}, ${(trunk + 6.5).toFixed(1)} ${cy.toFixed(1)}, ${endX} ${cy.toFixed(
                  1,
                )}`;

                return (
                  <path
                    key={`idle-${child.value}`}
                    d={shootPath}
                    className="branched-menu__branch-idle"
                  />
                );
              })}

              {/* Tallo + brote activo animado desde arriba y hojas elásticas */}
              {children.map((child, idx) => {
                const cy = centers[idx] ?? 6 + idx * 44 + 20;
                const startY = Math.max(2, cy - 13);
                const isChildActive = child.value === activeValue;
                const fullActivePath = `M ${trunk} 2 L ${trunk} ${startY.toFixed(1)} C ${trunk} ${(
                  cy - 3.5
                ).toFixed(1)}, ${(trunk + 6.5).toFixed(1)} ${cy.toFixed(1)}, ${endX} ${cy.toFixed(
                  1,
                )}`;

                return (
                  <g key={`active-${child.value}`}>
                    <path
                      d={fullActivePath}
                      pathLength={1}
                      stroke={`url(#${gradId})`}
                      data-active={isChildActive ? 'true' : 'false'}
                      className="branched-menu__stem-active"
                    />

                    <g
                      className="branched-menu__leaf-group"
                      data-active={isChildActive ? 'true' : 'false'}
                    >
                      <g transform={`translate(${(trunk - 0.5).toFixed(1)}, ${(cy - 8).toFixed(1)})`}>
                        <path
                          className="branched-menu__leaf branched-menu__leaf--stem"
                          d="M 0 0 C -2.2 -4.2, -7.2 -5.5, -8.8 -1.6 C -5.8 1.2, -2.2 1.1, 0 0 Z"
                        />
                      </g>
                      <g transform={`translate(${(endX - 8.5).toFixed(1)}, ${(cy - 1.2).toFixed(1)})`}>
                        <path
                          className="branched-menu__leaf branched-menu__leaf--tip"
                          d="M 0 0 C 1.8 -4.4, 6.4 -5.2, 8.2 -1.4 C 5.4 1.3, 1.9 1, 0 0 Z"
                        />
                      </g>
                    </g>
                  </g>
                );
              })}
            </svg>

            {children.map((child, idx) => {
              const ChildIcon = child.icon;
              const isChildActive = child.value === activeValue;

              return (
                <button
                  key={child.value}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  tabIndex={isOpen ? 0 : -1}
                  data-active={isChildActive ? 'true' : 'false'}
                  onClick={() => onSelect(child.value)}
                  className="branched-menu__item"
                >
                  {ChildIcon && (
                    <ChildIcon className="branched-menu__item-icon" strokeWidth={1.75} />
                  )}
                  <span className="branched-menu__label">{child.label}</span>
                  {typeof child.badge === 'number' && child.badge > 0 && (
                    <span className="branched-menu__badge">{child.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BranchedMenu<T extends string = string>({
  items,
  activeValue,
  onSelect,
  drawDuration = 400,
  trunk = 20,
  indent = 48,
  className = '',
}: BranchedMenuProps<T>) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        const containsActive = item.children.some((c) => c.value === activeValue);
        initial[item.value] = Boolean(item.defaultOpen || containsActive);
      }
    }
    return initial;
  });

  const handleToggle = (key: string) => {
    setOpenMap((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  };

  return (
    <nav
      aria-label="Navegación principal AquaPlants"
      className={`branched-menu ${className}`.trim()}
    >
      {items.map((item) => {
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const HeadIcon = item.icon;
        const isDirectActive = !hasChildren && item.value === activeValue;

        return (
          <Fragment key={item.value}>
            {item.dividerBefore && <hr className="branched-menu__divider" />}

            {hasChildren ? (
              <BranchGroup
                item={item}
                isOpen={openMap[item.value] ?? Boolean(item.defaultOpen)}
                onToggle={() => handleToggle(item.value)}
                activeValue={activeValue}
                onSelect={(val) => {
                  setOpenMap((prev) => ({ ...prev, [item.value]: true }));
                  onSelect(val);
                }}
                drawDuration={drawDuration}
                trunk={trunk}
                indent={indent}
              />
            ) : (
              <button
                type="button"
                data-active={isDirectActive ? 'true' : 'false'}
                onClick={() => onSelect(item.value)}
                className="branched-menu__head"
              >
                {HeadIcon && (
                  <HeadIcon className="branched-menu__head-icon" strokeWidth={1.8} />
                )}
                <span className="branched-menu__label">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="branched-menu__badge">{item.badge}</span>
                )}
              </button>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
