import React, { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Draggable product-preview surface.
 *
 * Desktop:
 *   primary-button drag -> release -> spring home.
 *
 * Touch:
 *   first tap arms the surface for a short window;
 *   second tap + hold starts a real drag. Release springs home.
 *
 * The first tap keeps normal page scrolling intact. Only the armed/active
 * surface switches to touch-action:none, so a normal swipe over the landing
 * preview still scrolls the page.
 */
export default function DragReturn({
  children,
  className = '',
  label = 'Interactive preview',
  mode = 'flow',
  returnMs = 460,
  touchArmMs = 1250,
}: { children: ReactNode; className?: string; label?: string; mode?: string; returnMs?: number; touchArmMs?: number }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [touchArmed, setTouchArmed] = useState(false);
  const drag = useRef<{ active: boolean; pointerId: number | null; x: number; y: number; ox: number; oy: number; type: string }>({ active: false, pointerId: null, x: 0, y: 0, ox: 0, oy: 0, type: '' });
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
  }, []);

  const writeOffset = (x: number, y: number) => {
    offset.current = { x, y };
    const node = nodeRef.current;
    if (!node) return;
    node.style.setProperty('--drag-x', `${x}px`);
    node.style.setProperty('--drag-y', `${y}px`);
  };

  const disarmTouch = () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = null;
    setTouchArmed(false);
  };

  const armTouch = () => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setTouchArmed(true);
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null;
      setTouchArmed(false);
    }, touchArmMs);
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.cancelable) event.preventDefault();
    drag.current = {
      active: true,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: offset.current.x,
      oy: offset.current.y,
      type: event.pointerType,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return;
      startDrag(event);
      return;
    }

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      // Touch intentionally needs two gestures: tap once to arm, then tap and
      // hold to drag. This avoids stealing ordinary vertical scrolling.
      if (touchArmed) {
        disarmTouch();
        startDrag(event);
      }
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    writeOffset(
      drag.current.ox + (event.clientX - drag.current.x),
      drag.current.oy + (event.clientY - drag.current.y),
    );
  };

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current.active && drag.current.pointerId === event.pointerId) {
      drag.current.active = false;
      drag.current.pointerId = null;
      if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragging(false);
      disarmTouch();
      writeOffset(0, 0);
      return;
    }

    // A normal touch tap arms the object. The following tap+hold is the drag.
    if ((event.pointerType === 'touch' || event.pointerType === 'pen') && !touchArmed) {
      armTouch();
    }
  };

  const cancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current.active && drag.current.pointerId === event.pointerId) {
      drag.current.active = false;
      drag.current.pointerId = null;
      setDragging(false);
      writeOffset(0, 0);
    }
    disarmTouch();
  };

  const recoverLostCapture = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    drag.current.pointerId = null;
    setDragging(false);
    disarmTouch();
    writeOffset(0, 0);
  };

  return (
    <div
      ref={nodeRef}
      className={`drag-return drag-return--${mode} ${className} ${dragging ? 'is-dragging' : ''} ${touchArmed ? 'is-touch-armed' : ''}`}
      style={{
        '--drag-x': '0px',
        '--drag-y': '0px',
        '--drag-return-ms': `${returnMs}ms`,
      } as React.CSSProperties}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={cancel}
      onLostPointerCapture={recoverLostCapture}
      role="group"
      aria-label={`${label}. On desktop, drag with the primary mouse button. On touch, tap once, then tap and hold to drag. Release to return.`}
      aria-grabbed={dragging}
      data-touch-armed={touchArmed ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
