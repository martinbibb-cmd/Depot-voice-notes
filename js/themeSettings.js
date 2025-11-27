import { applyTheme, applyThemeFromStorage, getThemeOptions } from "./theme.js";

function populateThemeOptions(selectEl) {
  if (!selectEl) return;
  const options = getThemeOptions();
  options.forEach((value) => {
    if (!selectEl.querySelector(`option[value="${value}"]`)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
      selectEl.appendChild(option);
    }
  });
}

function initThemeSelector() {
  const select = document.getElementById("colorThemeSelect");
  if (!select) return;
  populateThemeOptions(select);
  const current = applyThemeFromStorage();
  select.value = current;

  select.addEventListener("change", (event) => {
    applyTheme(event.target.value);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyThemeFromStorage();
  initThemeSelector();
});
