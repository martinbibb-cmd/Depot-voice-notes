export const appState = {
  transcript: "",
  sections: {},
  checklistStatus: {},
  materials: [],
};

export function resetAppState() {
  appState.transcript = "";
  appState.sections = {};
  appState.checklistStatus = {};
  appState.materials = [];
}
