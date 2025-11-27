const THEME_STORAGE_KEY = "depot.themePreference";
const VALID_THEMES = ["blue", "green"];
const DEFAULT_THEME = "blue";

export function getSavedTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return VALID_THEMES.includes(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(themeName) {
  const theme = VALID_THEMES.includes(themeName) ? themeName : DEFAULT_THEME;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  return theme;
}

export function applyThemeFromStorage() {
  return applyTheme(getSavedTheme());
}

export function getThemeOptions() {
  return [...VALID_THEMES];
}
