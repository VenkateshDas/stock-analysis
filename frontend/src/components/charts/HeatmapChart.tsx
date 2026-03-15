import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import {
  hierarchy,
  treemap,
  treemapSquarify,
  interpolateRgb,
} from 'd3'
import type { HierarchyRectangularNode } from 'd3'
import type { HeatmapData, HeatmapStock } from '../../types/heatmap'

interface Props {
  data: HeatmapData
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  stock: HeatmapStock | null
}

// Suffix patterns for stripping exchange codes from display
const EXCHANGE_RE = /\.(NS|BO|HK|T|AX|KS|L|PA|F|DE)$/i

function stripExchange(sym: string) {
  return sym.replace(EXCHANGE_RE, '')
}

/**
 * Returns a background colour for a given % change value.
 * Positive → green gradient, negative → red gradient, null → neutral.
 */
function getColor(pct: number | null): string {
  if (pct === null || pct === undefined) return '#2a2a2a'

  const p = Math.max(-5, Math.min(5, pct))

  if (p > 0) {
    // 0 → faint green, 5 → deep forest green
    const t = Math.sqrt(p / 5)
    return interpolateRgb('#1a3d27', '#0c5e29')(t)
  } else if (p < 0) {
    // 0 → faint red, -5 → deep crimson
    const t = Math.sqrt(-p / 5)
    return interpolateRgb('#3d1a1a', '#7a0c17')(t)
  }
  return '#2a2a2a'
}

/** Intermediate colour used for the legend strip */
function legendColor(v: number) {
  return getColor(v)
}

// Leaf node data shape after hierarchy construction
interface LeafData extends HeatmapStock {
  value: number
}

interface SectorData {
  name: string
  children: LeafData[]
}

interface RootData {
  name: string
  children: SectorData[]
}

export function HeatmapChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 0, height: 0 })
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    stock: null,
  })

  // Track container size with ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setDims({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    ro.observe(el)
    setDims({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Build D3 treemap layout whenever data or dimensions change
  const { sectorNodes, leafNodes } = useMemo(() => {
    const { width, height } = dims
    if (width === 0 || height === 0) return { sectorNodes: [], leafNodes: [] }

    const rootData: RootData = {
      name: 'root',
      children: data.sectors.map((sec) => ({
        name: sec.name,
        children: sec.stocks.map((s) => ({ ...s, value: s.weight })),
      })),
    }

    const root = hierarchy<RootData | SectorData | LeafData>(rootData)
      .sum((d) => ('value' in d ? (d as LeafData).value : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    treemap<RootData | SectorData | LeafData>()
      .size([width, height])
      .paddingOuter(4)
      .paddingInner(1)
      .paddingTop((d) => (d.depth === 1 ? 18 : 0))
      .tile(treemapSquarify)(root as HierarchyRectangularNode<RootData | SectorData | LeafData>)

    const rectRoot = root as HierarchyRectangularNode<RootData | SectorData | LeafData>
    return {
      sectorNodes: rectRoot.children ?? [],
      leafNodes: rectRoot.leaves(),
    }
  }, [data, dims])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, stock: HeatmapStock) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, stock })
    },
    [],
  )

  const handleMouseLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }))
  }, [])

  const { width, height } = dims

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden"
      style={{ height: 580, background: '#0a0a0a' }}
    >
      {width > 0 && height > 0 && (
        <>
          {/* ── Sector border frames ── */}
          {sectorNodes.map((node) => {
            const n = node as HierarchyRectangularNode<SectorData>
            const w = n.x1 - n.x0
            const h = n.y1 - n.y0
            return (
              <div
                key={n.data.name}
                style={{
                  position: 'absolute',
                  left: n.x0,
                  top: n.y0,
                  width: w,
                  height: h,
                  border: '1px solid #1f1f1f',
                  borderRadius: 3,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
            )
          })}

          {/* ── Stock leaf cells ── */}
          {leafNodes.map((leaf) => {
            const l = leaf as HierarchyRectangularNode<LeafData>
            const w = l.x1 - l.x0 - 2
            const h = l.y1 - l.y0 - 2
            if (w <= 0 || h <= 0) return null
            const stock = l.data
            const bg = getColor(stock.change_pct)
            const short = stripExchange(stock.symbol)
            const showTicker = w > 28 && h > 18
            const showPct = h > 32 && w > 38

            return (
              <div
                key={stock.symbol}
                onMouseMove={(e) => handleMouseMove(e, stock)}
                onMouseLeave={handleMouseLeave}
                style={{
                  position: 'absolute',
                  left: l.x0 + 1,
                  top: l.y0 + 1,
                  width: w,
                  height: h,
                  backgroundColor: bg,
                  overflow: 'hidden',
                  cursor: 'default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  borderRadius: 2,
                }}
              >
                {showTicker && (
                  <span
                    style={{
                      fontSize: Math.min(13, Math.max(8, w / 5)),
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1.2,
                      textAlign: 'center',
                      padding: '0 2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      maxWidth: '100%',
                    }}
                  >
                    {short}
                  </span>
                )}
                {showPct && (
                  <span
                    style={{
                      fontSize: Math.min(11, Math.max(7, w / 6)),
                      color: 'rgba(255,255,255,0.85)',
                      lineHeight: 1,
                    }}
                  >
                    {stock.change_pct !== null
                      ? `${stock.change_pct >= 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%`
                      : '—'}
                  </span>
                )}
              </div>
            )
          })}

          {/* ── Sector labels (float on top) ── */}
          {sectorNodes.map((node) => {
            const n = node as HierarchyRectangularNode<SectorData>
            const w = n.x1 - n.x0
            return (
              <div
                key={`label-${n.data.name}`}
                style={{
                  position: 'absolute',
                  left: n.x0 + 4,
                  top: n.y0 + 3,
                  width: w - 8,
                  height: 14,
                  fontSize: Math.min(10, w / 9),
                  color: '#b0b0b0',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              >
                {n.data.name}
              </div>
            )
          })}

          {/* ── Tooltip ── */}
          {tooltip.visible && tooltip.stock && (() => {
            const s = tooltip.stock
            return (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(tooltip.x + 14, width - 200),
                  top: Math.max(4, tooltip.y - 100),
                  background: 'rgba(15,15,15,0.97)',
                  border: '1px solid #333',
                  borderRadius: 8,
                  padding: '10px 14px',
                  zIndex: 200,
                  pointerEvents: 'none',
                  minWidth: 170,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                }}
              >
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 2 }}>
                  {stripExchange(s.symbol)}
                </div>
                <div style={{ color: '#999', fontSize: 11, marginBottom: 6 }}>{s.name}</div>
                <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>{s.industry}</div>
                {s.change_pct !== null && (
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: s.change_pct >= 0 ? '#2ecc71' : '#e74c3c',
                      marginBottom: 3,
                    }}
                  >
                    {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                  </div>
                )}
                {s.price !== null && (
                  <div style={{ color: '#ccc', fontSize: 11 }}>
                    Price: {s.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                )}
                <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>
                  Weight: {s.weight.toFixed(1)}%
                </div>
              </div>
            )
          })()}

          {/* ── Legend ── */}
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              zIndex: 20,
            }}
          >
            <span style={{ color: '#555', fontSize: 9 }}>−3%</span>
            {[-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3].map((v) => (
              <div
                key={v}
                title={`${v > 0 ? '+' : ''}${v}%`}
                style={{
                  width: 18,
                  height: 10,
                  background: legendColor(v),
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
            ))}
            <span style={{ color: '#555', fontSize: 9 }}>+3%</span>
          </div>
        </>
      )}
    </div>
  )
}
