// onboarding.js – personalización siempre visible + sugerencia automática
import { DEFAULT_SERIES, SERIES_ID_REGEX, BANXICO_API_BASE } from './constants.js';

(() => {
  const $ = s => document.querySelector(s);
  const sayToken = t => { const m = $("#msg"); if (m) m.textContent = t || ""; };
  const saySeries = t => { const m = $("#seriesMsg"); if (m) m.textContent = t || ""; };

  // State for tracking if we're in edit mode
  let editingSeriesId = null;

  // Mostrar controles según si hay token
  function updateFormatControls(hasToken) {
    // defensive: element may not exist if DOM not ready
    const manualFormat = $("#manualFormat");
    if (manualFormat && manualFormat.style) manualFormat.style.display = "flex";
  }

  // Update edit mode UI
  function setEditMode(seriesId, seriesTitle) {
    editingSeriesId = seriesId;
    const indicator = $("#editModeIndicator");
    const addBtn = $("#addById");
    const cancelBtn = $("#cancelEdit");
    
    if (!indicator || !addBtn || !cancelBtn) return;

    if (seriesId) {
      indicator.style.display = "block";
      const editingLabel = $("#editingSeriesName");
      if (editingLabel) editingLabel.textContent = `${seriesTitle} (${seriesId})`;
      addBtn.textContent = "Guardar cambios";
      cancelBtn.style.display = "inline-block";
    } else {
      indicator.style.display = "none";
      addBtn.textContent = "Añadir serie";
      cancelBtn.style.display = "none";
      editingSeriesId = null;
    }
  }

  chrome.storage.local.get(["sieToken", "sieSeries"], ({ sieToken = "", sieSeries = [] }) => {
    $("#token").value = sieToken;
    updateFormatControls(!!sieToken);

    if (!Array.isArray(sieSeries) || sieSeries.length === 0) {
      chrome.storage.local.set({ sieSeries: DEFAULT_SERIES }, () => renderSelected(DEFAULT_SERIES));
    } else {
      renderSelected(sieSeries);
    }
  });

  $("#save")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    await chrome.storage.local.set({ sieToken: t });
    sayToken(t ? "Token guardado." : "Token borrado.");
  });

  $("#test")?.addEventListener("click", async () => {
    const t = $("#token").value.trim();
    if (!t) { sayToken("Ingresa un token SIE."); return; }
    sayToken("Probando token…");
    try {
      const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno?mediaType=json&token=${encodeURIComponent(t)}`;
      const r = await fetch(url, { cache: "no-store" });
      sayToken(r.ok ? "Token válido." : `HTTP ${r.status}`);
    } catch (e) { sayToken(`Error: ${e.message}`); }
  });

  $("#open")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  });

  $("#addById")?.addEventListener("click", async () => {
    const id = $("#seriesId").value.trim().toUpperCase();
    if (!SERIES_ID_REGEX.test(id)) {
      saySeries("ID inválido. Ejemplos: SF43718, SL11298, SG61745…");
      return;
    }

    const type = $("#seriesType").value;
    if (type === "currency" && !$("#seriesCurrency").value.trim()) {
      saySeries("Para moneda, especifica el código (ej: MXN, USD).");
      return;
    }

    const st = await chrome.storage.local.get(["sieToken", "sieSeries"]);
    let list = Array.isArray(st.sieSeries) ? st.sieSeries : [];
    const existingIndex = list.findIndex(s => s.id === id);
    const isEdit = editingSeriesId !== null;

    let title = id;
    let currency = $("#seriesCurrency").value.trim().toUpperCase() || undefined;
    let decimals = Number($("#seriesDecimals").value) || 2;
    let periodicity = "Desconocida";
    let figure = "Sin tipo";
    const hasToken = !!st.sieToken?.trim();

    // Sugerencia automática (solo si hay token y no es edición)
    if (hasToken && !isEdit) {
      try {
        const metaUrl = `${BANXICO_API_BASE}/series/${id}?mediaType=json&token=${encodeURIComponent(st.sieToken)}`;
        const metaRes = await fetch(metaUrl, { cache: "no-store" });
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          const serie = metaJson?.bmx?.series?.[0];
          if (serie) {
            title = serie.titulo || id;
            periodicity = serie.periodicidad || "Desconocida";
            figure = serie.cifra || "Sin tipo";

            const texto = `${(serie.unidad || "")} ${(serie.cifra || "")}`.toLowerCase();

            let suggestedType = "number";
            let suggestedCurrency = undefined;
            let suggestedDecimals = 2;

            if (texto.includes("porcentaje") || texto.includes("por ciento") || texto.includes("%")) {
              suggestedType = "percent";
              suggestedDecimals = 4;
            } else if (texto.includes("pesos") || texto.includes("dólares") || texto.includes("millones") || texto.includes("miles")) {
              suggestedType = "currency";
              suggestedCurrency = texto.includes("dólares") ? "USD" : "MXN";
              suggestedDecimals = texto.includes("miles") || texto.includes("millones") ? 0 : 2;
            } else if (texto.includes("índice") || texto.includes("udis")) {
              suggestedType = "number";
              suggestedDecimals = 4;
            }

            // Aplicamos sugerencia en los controles
            $("#seriesType").value = suggestedType;
            $("#seriesCurrency").value = suggestedCurrency || "";
            $("#seriesDecimals").value = suggestedDecimals;
            type = suggestedType;
            currency = suggestedCurrency;
            decimals = suggestedDecimals;

            saySeries("Sugerencia automática aplicada. Cambia si lo prefieres.");
          }
        }
      } catch (e) { /* silencioso */ }
    } else if (isEdit) {
      title = list[existingIndex].title;
      periodicity = list[existingIndex].periodicity;
      figure = list[existingIndex].figure;
    }

    const item = { id, title, type, currency, decimals, periodicity, figure };

    if (isEdit) {
      list[existingIndex] = item;
      saySeries("Serie actualizada.");
    } else {
      list.push(item);
      // If title is still just the ID, show a note to the user
      if (title === id) {
        saySeries(`Serie añadida (sin token: usa el ID como título). Edítala para cambiar el nombre.`);
      } else {
        saySeries("Serie añadida.");
      }
    }

    await chrome.storage.local.set({ sieSeries: list });
    renderSelected(list);
    $("#seriesId").value = "";
    setEditMode(null);
  });

  // Cancel edit mode
  $("#cancelEdit")?.addEventListener("click", () => {
    setEditMode(null);
    $("#seriesId").value = "";
    $("#seriesType").value = "number";
    $("#seriesCurrency").value = "";
    $("#seriesDecimals").value = "2";
    saySeries("Edición cancelada.");
  });

  function renderSelected(list) {
    const box = $("#selected");
    box.innerHTML = "";
    if (!list?.length) {
      box.innerHTML = `<span class="row-sub">Aún no tienes series seleccionadas.</span>`;
    } else {
      const listContainer = document.createElement("div");
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const item = document.createElement("div");
        item.className = "series-item";
        
        // Content
        const content = document.createElement("div");
        content.className = "series-item-content";
        content.textContent = `${s.title} (${s.id})`;
        item.appendChild(content);
        
        // Actions
        const actions = document.createElement("div");
        actions.className = "series-item-actions";
        
        // Up arrow
        const upBtn = document.createElement("button");
        upBtn.className = "arrow-btn";
        upBtn.textContent = "▲";
        upBtn.disabled = i === 0;
        upBtn.title = "Mover arriba";
        upBtn.addEventListener("click", async () => {
          if (i > 0) {
            [list[i], list[i - 1]] = [list[i - 1], list[i]];
            await chrome.storage.local.set({ sieSeries: list });
            renderSelected(list);
          }
        });
        actions.appendChild(upBtn);
        
        // Down arrow
        const downBtn = document.createElement("button");
        downBtn.className = "arrow-btn";
        downBtn.textContent = "▼";
        downBtn.disabled = i === list.length - 1;
        downBtn.title = "Mover abajo";
        downBtn.addEventListener("click", async () => {
          if (i < list.length - 1) {
            [list[i], list[i + 1]] = [list[i + 1], list[i]];
            await chrome.storage.local.set({ sieSeries: list });
            renderSelected(list);
          }
        });
        actions.appendChild(downBtn);
        
        // Edit button
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "✎";
        editBtn.title = "Editar formato";
        editBtn.addEventListener("click", () => {
          $("#seriesId").value = s.id;
          $("#seriesType").value = s.type || "number";
          $("#seriesCurrency").value = s.currency || "";
          $("#seriesDecimals").value = s.decimals ?? 2;
          setEditMode(s.id, s.title);
          saySeries("Edita y presiona Guardar cambios para actualizar.");
        });
        actions.appendChild(editBtn);
        
        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "×";
        deleteBtn.title = "Eliminar";
        deleteBtn.addEventListener("click", async () => {
          const next = list.filter((_, idx) => idx !== i);
          await chrome.storage.local.set({ sieSeries: next });
          renderSelected(next);
        });
        actions.appendChild(deleteBtn);
        
        item.appendChild(actions);
        listContainer.appendChild(item);
      }
      box.appendChild(listContainer);
    }
  }
})();