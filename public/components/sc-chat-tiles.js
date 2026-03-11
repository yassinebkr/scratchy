/**
 * @fileoverview GenUI Inline Tile Renderer for Scratchy v2 Chat
 *
 * This module provides functions to render GenUI canvas ops as inline tiles
 * directly within the chat message stream, rather than in a separate panel.
 * It reuses the <sc-tile> component for rendering individual tiles.
 *
 * @module components/sc-chat-tiles
 */

// Import the tile component for its side-effects (custom element registration)
import './sc-tile.js';

// --- Stylesheet for inline tiles ---

const tileStyles = `
  .chat-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  /* When there's only one tile, it takes the full width */
  .chat-tiles:has(> sc-tile:nth-of-type(1):last-of-type) {
    grid-template-columns: 1fr;
  }

  /* When there are two tiles, they sit side-by-side */
  .chat-tiles:has(> sc-tile:nth-of-type(2):last-of-type) {
    grid-template-columns: repeat(2, 1fr);
  }

  sc-tile {
    background: #111118;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    max-height: 300px;
    overflow-y: auto;
    animation: tile-fade-in 200ms ease-out;
    animation-fill-mode: forwards;
    opacity: 0;
    transform: translateY(4px);
  }

  @keyframes tile-fade-in {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Mobile: always a single column */
  @media (max-width: 600px) {
    .chat-tiles,
    .chat-tiles:has(> sc-tile:nth-of-type(2):last-of-type) {
      grid-template-columns: 1fr;
    }
  }
`;

/**
 * Injects the necessary CSS for inline tiles into the document head.
 * Ensures that styles are added only once.
 */
function ensureStyles() {
  if (document.getElementById('sc-chat-tiles-styles')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'sc-chat-tiles-styles';
  styleEl.textContent = tileStyles;
  document.head.appendChild(styleEl);
}

// --- Public API ---

/**
 * Get or create the tile container for a message.
 * @param {HTMLElement} messageEl - The .message element.
 * @returns {HTMLElement} The .chat-tiles container element.
 */
export function getTileContainer(messageEl) {
  let container = messageEl.querySelector('.chat-tiles');
  if (!container) {
    container = document.createElement('div');
    container.className = 'chat-tiles';
    // Append to the content part of the message
    const contentEl = messageEl.querySelector('.msg-content') || messageEl;
    contentEl.appendChild(container);
  }
  return container;
}

/**
 * Render canvas ops as inline tiles within a chat message.
 * @param {HTMLElement} messageEl - The .message element to append to.
 * @param {object[]} ops - Array of GenUI ops.
 * @param {Map<string, HTMLElement>} tileRegistry - Shared registry of id→element for patch/remove.
 */
export function renderInlineTiles(messageEl, ops, tileRegistry) {
  ensureStyles();
  const tileContainer = getTileContainer(messageEl);

  ops.forEach((op, index) => {
    if (!op || typeof op !== 'object') return;

    switch (op.op) {
      case 'upsert': {
        if (!op.id) return;

        // If a tile with this ID already exists, remove the old one first
        if (tileRegistry.has(op.id)) {
          tileRegistry.get(op.id).remove();
        }

        const tile = document.createElement('sc-tile');
        tile.id = `inline-tile-${op.id}`;
        tile.setAttribute('type', op.type || 'card');
        if (op.data) {
          tile.setAttribute('data', JSON.stringify(op.data));
        }

        // Apply a staggered animation delay
        tile.style.animationDelay = `${index * 50}ms`;

        tileContainer.appendChild(tile);
        tileRegistry.set(op.id, tile);
        break;
      }

      case 'patch': {
        if (!op.id) return;
        const tile = tileRegistry.get(op.id);
        if (tile) {
          try {
            const currentData = JSON.parse(tile.getAttribute('data') || '{}');
            const newData = { ...currentData, ...op.data };
            tile.setAttribute('data', JSON.stringify(newData));
            // sc-tile has an internal `update` method that can be called for efficiency
            if (typeof tile.update === 'function') {
              tile.update(newData);
            }
          } catch (e) {
            console.error('Failed to parse or patch tile data:', e);
          }
        }
        break;
      }

      case 'remove': {
        if (!op.id) return;
        const tile = tileRegistry.get(op.id);
        if (tile) {
          tile.remove();
          tileRegistry.delete(op.id);
        }
        break;
      }

      case 'clear': {
        tileContainer.innerHTML = '';
        // Assuming clear op is for the whole message, clear all tracked tiles for this message
        // A more robust implementation would scope the registry per message
        for (const [id, el] of tileRegistry.entries()) {
            if (tileContainer.contains(el) || !el.isConnected) {
                tileRegistry.delete(id);
            }
        }
        break;
      }
    }
  });

  // After all ops, if the container is empty, remove it.
  if (tileContainer.children.length === 0) {
    tileContainer.remove();
  }
}
