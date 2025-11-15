import { loadSchema } from "./schema.js";
import { setupUI } from "./ui.js";

const schema = loadSchema();
setupUI(schema, () => {});
