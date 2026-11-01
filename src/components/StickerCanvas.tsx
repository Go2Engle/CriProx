import { useEffect, useRef, useState } from 'react';
import { hasCustomCuts, hasTrimmedOutline, stickerLocalCuts, pathSvg } from '../lib/sticker-cuts';
import StickerArtworkImage from './StickerArtworkImage';
import { MachineGuideLegend, MachineGuideShapes } from './MachineGuides';
import { machineGuide, outsidePlanningGuide } from '../lib/machine-guides';
import { PT_PER_MM, type RegistrationProfile } from '../lib/registration';
import {
  editSticker,
  stickerBounds,
  stickerSheets,
  stickerTemplate,
  type StickerPose,
  type StickerProject,
} from '../lib/stickers';

export default function StickerCanvas({
  project,
  zoom,
  profile,
  page,
  selected,
  select,
  change,
  checkpoint,
  error,
  showCuts = false,
}: {
  project: StickerProject;
  zoom: number;
  profile?: RegistrationProfile;
  page: number;
  selected: number;
  select: (i: number) => void;
  change: (p: StickerProject) => void;
  checkpoint: () => void;
  error: (message: string) => void;
  showCuts?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 500, height: 500 });
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSpace({
        width: Math.max(100, element.clientWidth - 36),
        height: Math.max(100, element.clientHeight - 36),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const drag = useRef<
    | {
        id: number;
        index: number;
        kind: 'move' | 'resize';
        x: number;
        y: number;
        pose: StickerPose;
        project: StickerProject;
        started: boolean;
      }
    | undefined
  >(undefined);
  const sheet = stickerSheets(project)[page];
  // Keep the same coordinate frame when the first drag turns fixed slots into individual poses.
  const width = project.settings.areaWidth,
    height = project.settings.areaHeight;
  const guide = machineGuide(project.machine, project.settings.paper);
  const paper = profile
    ? { width: profile.pageWidthPt / PT_PER_MM, height: profile.pageHeightPt / PT_PER_MM }
    : guide.page;
  const left = profile?.leftMm ?? (paper.width - width) / 2;
  const top = profile?.topMm ?? (paper.height - height) / 2;
  const handleSize =
    (7 * paper.width) / (zoom * Math.min(space.width, (space.height * paper.width) / paper.height));
  const template = stickerTemplate(project.settings);
  const area = {
    x: left,
    y: top,
    width: profile ? template.width : width,
    height: profile ? template.height : height,
  };
  const conflicts =
    sheet?.placements.filter((p) =>
      outsidePlanningGuide(
        { x: p.x + left, y: p.y + top, width: p.width, height: p.height },
        guide,
      ),
    ).length ?? 0;
  function point(e: { clientX: number; clientY: number }) {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : null;
  }
  function start(
    e: React.PointerEvent<SVGGElement | SVGRectElement>,
    index: number,
    pose: StickerPose,
    kind: 'move' | 'resize',
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    select(index);
    svg.current?.focus();
    const p = point(e);
    if (!p) return;
    svg.current?.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      index,
      pose: { ...pose },
      project,
      x: p.x,
      y: p.y,
      kind,
      started: false,
    };
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current,
      p = point(e);
    if (!d || !p || e.pointerId !== d.id) return;
    const dx = p.x - d.x,
      dy = p.y - d.y;
    if (!d.started && Math.hypot(dx, dy) < 0.2) return;
    let patch: Partial<StickerPose>;
    if (d.kind === 'move') {
      const b = stickerBounds(d.pose);
      patch = {
        x: Math.max(0, Math.min(project.settings.areaWidth - b.width, d.pose.x + dx)),
        y: Math.max(0, Math.min(project.settings.areaHeight - b.height, d.pose.y + dy)),
      };
    } else {
      const angle = (d.pose.rotation * Math.PI) / 180;
      patch = {
        width: Math.max(1, d.pose.width + dx * Math.cos(angle) + dy * Math.sin(angle)),
        height: Math.max(1, d.pose.height - dx * Math.sin(angle) + dy * Math.cos(angle)),
      };
    }
    try {
      const next = editSticker(d.project, d.index, patch);
      if (!d.started) {
        checkpoint();
        d.started = true;
      }
      change(next);
      error('');
    } catch {
      /* Retain the last in-bounds pointer position. */
    }
  }
  return (
    <div className="sticker-canvas-wrap">
      <p className="sticker-canvas-hint">
        Drag to move · drag a corner to resize · arrow keys to nudge
      </p>
      <div className="sticker-canvas-scroll" ref={viewport}>
        <svg
          ref={svg}
          className="sticker-edit-canvas"
          tabIndex={0}
          role="group"
          aria-label="Sticker sheet editor"
          style={{
            width: zoom * Math.min(space.width, (space.height * paper.width) / paper.height),
            minWidth: 0,
          }}
          viewBox={`${-left} ${-top} ${paper.width} ${paper.height}`}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = undefined;
          }}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) select(-1);
          }}
          onKeyDown={(e) => {
            if (
              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) ||
              selected < 0
            )
              return;
            const item = sheet?.placements.find((p) => p.itemIndex === selected);
            if (!item) return;
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            try {
              const next = editSticker(project, selected, {
                x: item.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
                y: item.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
              });
              checkpoint();
              change(next);
              error('');
            } catch (e) {
              error(String(e));
            }
          }}
        >
          <rect
            x={-left}
            y={-top}
            width={paper.width}
            height={paper.height}
            fill="white"
            stroke="#b9bcc5"
            strokeWidth={0.2}
            onPointerDown={() => select(-1)}
          />
          {profile && (
            <g pointerEvents="none">
              <image
                href={profile.preview}
                x={-left}
                y={-top}
                width={paper.width}
                height={paper.height}
              />
              {template.placements.map((p, i) => (
                <rect
                  key={i}
                  x={p.x - 0.35}
                  y={p.y - 0.35}
                  width={p.width + 0.7}
                  height={p.height + 0.7}
                  fill="white"
                />
              ))}
            </g>
          )}
          {sheet?.placements.map((p) => {
            const s = p.sticker,
              id = `sticker-clip-${page}-${p.itemIndex}`;
            const design = project.artwork.find((a) => a.id === p.entry.card.id)?.design;
            const custom = hasCustomCuts(design);
            const borderStroke = custom
              ? 0
              : Math.min(project.settings.borderStrokeWidth ?? 0, s.width / 2, s.height / 2);
            let cutPaths: ReturnType<typeof stickerLocalCuts> = [];
            if (custom && design) {
              try {
                cutPaths = stickerLocalCuts(design, s, project.settings.fit, false);
              } catch {
                /* Invalid imported geometry is rejected during preparation. */
              }
            }
            return (
              <g
                key={p.itemIndex}
                aria-label={`${p.entry.card.name}, sticker ${p.itemIndex + 1}`}
                role="button"
                tabIndex={0}
                onFocus={() => select(p.itemIndex)}
                onPointerDown={(e) => start(e, p.itemIndex, s, 'move')}
                transform={`translate(${p.x + p.width / 2} ${p.y + p.height / 2}) rotate(${s.rotation}) translate(${-s.width / 2} ${-s.height / 2})`}
              >
                <defs>
                  <clipPath id={id}>
                    {hasTrimmedOutline(design) ? (
                      cutPaths
                        .filter((path) => path.closed)
                        .map((path, index) => <path key={index} d={pathSvg(path)} />)
                    ) : (
                      <rect width={s.width} height={s.height} rx={custom ? 0 : s.radius} />
                    )}
                  </clipPath>
                </defs>
                <g clipPath={`url(#${id})`}>
                  <rect width={s.width} height={s.height} fill="white" />
                  <g
                    transform={`translate(${s.flipX ? s.width : 0} ${s.flipY ? s.height : 0}) scale(${s.flipX ? -1 : 1} ${s.flipY ? -1 : 1})`}
                  >
                    <StickerArtworkImage
                      source={p.entry.card.faces[0].image}
                      pose={s}
                      settings={project.settings}
                      custom={custom}
                    />
                  </g>
                  {!!borderStroke && (
                    <rect
                      x={borderStroke / 2}
                      y={borderStroke / 2}
                      width={s.width - borderStroke}
                      height={s.height - borderStroke}
                      rx={Math.max(0, s.radius - borderStroke / 2)}
                      fill="none"
                      stroke={project.settings.borderStrokeColor ?? '#222222'}
                      strokeWidth={borderStroke}
                    />
                  )}
                </g>
                <rect
                  width={s.width}
                  height={s.height}
                  rx={s.radius}
                  fill="none"
                  stroke={
                    showCuts && !custom
                      ? '#ec268f'
                      : selected === p.itemIndex
                        ? '#86868b'
                        : custom
                          ? 'none'
                          : '#999'
                  }
                  strokeWidth={showCuts || selected === p.itemIndex ? 1 : 0.5}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={showCuts || selected === p.itemIndex ? '4 3' : undefined}
                />
                {showCuts &&
                  custom &&
                  cutPaths.map((path, i) => (
                    <path
                      key={i}
                      d={pathSvg(path)}
                      fill="none"
                      stroke="#ec268f"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="4 3"
                      pointerEvents="none"
                    />
                  ))}
                {selected === p.itemIndex && (
                  <rect
                    x={s.width - handleSize / 2}
                    y={s.height - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="white"
                    stroke="#86868b"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    className="sticker-resize-handle"
                    aria-label="Resize selected sticker"
                    onPointerDown={(e) => start(e, p.itemIndex, s, 'resize')}
                  />
                )}
              </g>
            );
          })}
          {!sheet?.placements.length && (
            <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={4} fill="#717784">
              Import images or SVGs to get started
            </text>
          )}
          <g transform={`translate(${-left} ${-top})`}>
            <MachineGuideShapes
              machine={project.machine}
              paper={project.settings.paper}
              area={area}
              captured={!!profile}
            />
          </g>
        </svg>
      </div>
      <MachineGuideLegend
        machine={project.machine}
        paper={project.settings.paper}
        area={area}
        captured={!!profile}
        conflicts={conflicts}
      />
    </div>
  );
}
