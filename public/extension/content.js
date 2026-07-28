// Content script: Injected into all pages to provide form-filling assistance
(function() {
  'use strict';

  let activeSession = null;
  let helperWidget = null;
  let isWidgetMinimized = false;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SESSION_STARTED') {
      activeSession = msg.session;
      createWidget();
    } else if (msg.type === 'SESSION_ENDED') {
      activeSession = null;
      removeWidget();
    }
  });

  // Check for existing session on page load
  chrome.storage.local.get('activeSession', (data) => {
    if (data.activeSession) {
      activeSession = data.activeSession;
      createWidget();
    }
  });

  function createWidget() {
    removeWidget(); // Remove any existing widget

    if (!activeSession || !activeSession.fields || activeSession.fields.length === 0) return;

    helperWidget = document.createElement('div');
    helperWidget.id = 'muhtesem-helper-widget';
    helperWidget.innerHTML = `
      <div id="muhtesem-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="background:#6366f1; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; color:white;">M</div>
          <div>
            <div style="font-weight:700; font-size:13px;">${activeSession.studentName}</div>
            <div style="font-size:10px; color:#94a3b8;">${activeSession.universityName}</div>
          </div>
        </div>
        <div style="display:flex; gap:4px;">
          <button id="muhtesem-minimize" title="Kiçilt">−</button>
          <button id="muhtesem-close" title="Bağla">✕</button>
        </div>
      </div>
      <div id="muhtesem-body">
        ${activeSession.fields.map(f => `
          <div class="muhtesem-field-row">
            <span class="muhtesem-field-label">${f.label}</span>
            <div style="display:flex; align-items:center; gap:4px;">
              <span class="muhtesem-field-value">${f.value}</span>
              <button class="muhtesem-copy-btn" data-value="${f.value.replace(/"/g, '&quot;')}" title="Kopyala">📋</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Inject styles
    const style = document.createElement('style');
    style.id = 'muhtesem-helper-styles';
    style.textContent = `
      #muhtesem-helper-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: #0f172a;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.2);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f8fafc;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      #muhtesem-helper-widget.minimized {
        width: 200px;
        border-radius: 8px;
      }
      #muhtesem-helper-widget.minimized #muhtesem-body {
        display: none;
      }
      #muhtesem-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: rgba(30, 41, 59, 0.9);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        cursor: move;
        user-select: none;
      }
      #muhtesem-header button {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: #94a3b8;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.15s;
      }
      #muhtesem-header button:hover {
        background: #6366f1;
        color: white;
      }
      #muhtesem-body {
        max-height: 340px;
        overflow-y: auto;
        padding: 8px 0;
      }
      #muhtesem-body::-webkit-scrollbar {
        width: 4px;
      }
      #muhtesem-body::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
      }
      .muhtesem-field-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 14px;
        transition: background 0.15s;
      }
      .muhtesem-field-row:hover {
        background: rgba(255,255,255,0.03);
      }
      .muhtesem-field-label {
        font-size: 11px;
        color: #64748b;
        white-space: nowrap;
      }
      .muhtesem-field-value {
        font-size: 12px;
        font-weight: 600;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: right;
      }
      .muhtesem-copy-btn {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 4px;
        padding: 2px 5px;
        font-size: 10px;
        cursor: pointer;
        color: #94a3b8;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .muhtesem-copy-btn:hover {
        background: #6366f1;
        color: white;
      }
      .muhtesem-copy-btn.copied {
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(16, 185, 129, 0.3);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(helperWidget);

    // Event listeners
    helperWidget.querySelector('#muhtesem-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      isWidgetMinimized = !isWidgetMinimized;
      helperWidget.classList.toggle('minimized', isWidgetMinimized);
      e.target.textContent = isWidgetMinimized ? '+' : '−';
    });

    helperWidget.querySelector('#muhtesem-close').addEventListener('click', (e) => {
      e.stopPropagation();
      removeWidget();
    });

    // Copy buttons
    helperWidget.querySelectorAll('.muhtesem-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = btn.getAttribute('data-value');
        navigator.clipboard.writeText(val).then(() => {
          btn.textContent = '✅';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = '📋';
            btn.classList.remove('copied');
          }, 1200);
        }).catch(() => {
          // Fallback for older browsers
          const ta = document.createElement('textarea');
          ta.value = val;
          ta.style.cssText = 'position:fixed;left:-9999px;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = '✅';
          setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });
    });

    // Make widget draggable
    makeDraggable(helperWidget, helperWidget.querySelector('#muhtesem-header'));

    // Detect and enhance input fields on the page
    enhanceInputFields();
  }

  function removeWidget() {
    const existing = document.getElementById('muhtesem-helper-widget');
    if (existing) existing.remove();
    const styles = document.getElementById('muhtesem-helper-styles');
    if (styles) styles.remove();
    // Remove any dropdown overlays
    document.querySelectorAll('.muhtesem-dropdown').forEach(el => el.remove());
    helperWidget = null;
  }

  function makeDraggable(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      const rect = element.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      element.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      element.style.left = x + 'px';
      element.style.top = y + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        element.style.transition = '';
      }
    });
  }

  // Flag: is user hovering/interacting with the dropdown?
  let isInteractingWithDropdown = false;
  // Track blur timeout so we can cancel it when a new input gets focus
  let blurTimerId = null;

  function enhanceInputFields() {
    if (!activeSession || !activeSession.fields) return;

    // Find all visible input/textarea/select elements
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea');

    inputs.forEach(input => {
      if (input.dataset.muhtesemEnhanced) return;
      input.dataset.muhtesemEnhanced = 'true';

      input.addEventListener('focus', () => {
        // Cancel any pending blur-hide from previous input
        if (blurTimerId) {
          clearTimeout(blurTimerId);
          blurTimerId = null;
        }
        showDropdown(input);
      });

      input.addEventListener('blur', () => {
        // Cancel previous timer if any
        if (blurTimerId) clearTimeout(blurTimerId);
        // Only hide if user is NOT interacting with the dropdown
        blurTimerId = setTimeout(() => {
          blurTimerId = null;
          if (!isInteractingWithDropdown) {
            hideDropdown(input);
          }
        }, 300);
      });
    });
  }

  function showDropdown(input) {
    if (!activeSession) return;

    hideAllDropdowns();

    const dropdown = document.createElement('div');
    dropdown.className = 'muhtesem-dropdown';
    dropdown.style.cssText = `
      position: absolute;
      z-index: 2147483646;
      background: #1e293b;
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      max-height: 220px;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-width: 200px;
    `;

    // When mouse enters dropdown area, set flag so blur won't close it
    dropdown.addEventListener('mouseenter', () => {
      isInteractingWithDropdown = true;
    });
    dropdown.addEventListener('mouseleave', () => {
      isInteractingWithDropdown = false;
    });
    // Also prevent mousedown on the dropdown from stealing focus
    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    activeSession.fields.forEach(field => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        transition: background 0.15s;
        color: #f8fafc;
      `;
      item.innerHTML = `
        <span style="font-size:11px; color:#64748b;">${field.label}</span>
        <span style="font-size:12px; font-weight:600; color:#f8fafc;">${field.value}</span>
      `;
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(99, 102, 241, 0.15)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Set value using native input setter for React/Vue compatibility
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
          || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, field.value);
        } else {
          input.value = field.value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        isInteractingWithDropdown = false;
        hideAllDropdowns();
        // Re-focus the input so user can continue
        input.focus();
      });
      dropdown.appendChild(item);
    });

    // Position dropdown below input
    const rect = input.getBoundingClientRect();
    dropdown.style.left = (rect.left + window.scrollX) + 'px';
    dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    dropdown.style.width = Math.max(rect.width, 200) + 'px';
    dropdown.dataset.targetInput = input.name || input.id || Math.random().toString();

    document.body.appendChild(dropdown);
  }

  function hideDropdown(input) {
    if (isInteractingWithDropdown) return; // Don't hide if user is on dropdown
    const dropdowns = document.querySelectorAll('.muhtesem-dropdown');
    dropdowns.forEach(d => d.remove());
  }

  function hideAllDropdowns() {
    document.querySelectorAll('.muhtesem-dropdown').forEach(d => d.remove());
  }

  // Close dropdown when clicking outside (anywhere on page that isn't dropdown or input)
  document.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.muhtesem-dropdown');
    if (!dropdown) return;
    // If click is inside dropdown or on an enhanced input, don't close
    if (dropdown.contains(e.target)) return;
    if (e.target.dataset && e.target.dataset.muhtesemEnhanced) return;
    isInteractingWithDropdown = false;
    hideAllDropdowns();
  }, true);

  // Re-scan for new inputs periodically (for SPA pages)
  setInterval(() => {
    if (activeSession) {
      enhanceInputFields();
    }
  }, 3000);
})();

