import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { TemplateVariable } from "../../types.ts";
import { textInput } from "../utils/dialog-style.ts";
import { TOKEN } from "../utils/theme.ts";

interface Props {
  names: readonly string[];
  variables: readonly TemplateVariable[];
  t: TranslateNS<"prompt-enhancer">;
  onChange: (name: string, field: "description" | "defaultValue", value: string) => void;
}

export function TemplateVariableFields({ names, variables, t, onChange }: Props) {
  return names.map((name) => {
    const variable = variables.find((item) => item.name === name);
    return (
      <fieldset key={name} style={FIELDS}>
        <legend style={{ overflowWrap: "anywhere", maxWidth: "100%" }}>{name}</legend>
        <label style={FIELD}>
          <span style={LABEL}>{t("vars.description")}</span>
          <input style={INPUT} value={variable?.description ?? ""}
            onChange={(event) => onChange(name, "description", event.currentTarget.value)} />
        </label>
        <label style={FIELD}>
          <span style={LABEL}>{t("vars.defaultValue")}</span>
          <input style={INPUT} value={variable?.defaultValue ?? ""}
            onChange={(event) => onChange(name, "defaultValue", event.currentTarget.value)} />
        </label>
      </fieldset>
    );
  });
}

const FIELDS = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 8, minWidth: 0, border: 0, margin: "8px 0", padding: 0,
};
const FIELD = { display: "grid", gap: 4, minWidth: 0 };
const LABEL = { color: TOKEN.muted, fontSize: 12 };
const INPUT = { ...textInput, fontSize: 13, padding: "7px 9px" };
