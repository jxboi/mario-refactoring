import {Body, Container, Head, Heading, Hr, Html, Preview, Section, Text} from "@react-email/components";
import {createElement as h} from "react";
import type {AutomationEmailPayload} from "../src/lib/automations.ts";

export function TaskStageChangedEmail(payload: AutomationEmailPayload) {
  return h(Html, null,
    h(Head),
    h(Preview, null, payload.test ? "Test automation: " : "", payload.taskTitle, " moved to ", payload.toStageLabel),
    h(Body, {style: {backgroundColor: "#f5f5f3", color: "#252522", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", margin: 0, padding: "32px 12px"}},
      h(Container, {style: {backgroundColor: "#ffffff", border: "1px solid #e2e1dc", borderRadius: "12px", margin: "0 auto", maxWidth: "560px", padding: "32px"}},
        h(Text, {style: {color: "#73716b", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 12px", textTransform: "uppercase"}}, payload.test ? "Chisel automation test" : "Chisel task update"),
        h(Heading, {style: {fontSize: "24px", lineHeight: "1.25", margin: "0 0 16px"}}, payload.taskTitle),
        h(Text, {style: {fontSize: "15px", lineHeight: "1.6", whiteSpace: "pre-wrap"}}, payload.message),
        h(Hr, {style: {borderColor: "#e8e7e2", margin: "24px 0"}}),
        h(Section, null,
          h(Text, {style: {color: "#73716b", fontSize: "13px", lineHeight: "1.7", margin: 0}},
            h("strong", null, "Workspace:"), " ", payload.workspaceName, h("br"),
            h("strong", null, "Project:"), " ", payload.projectTitle, h("br"),
            h("strong", null, "Transition:"), " ", payload.fromStageLabel, " → ", payload.toStageLabel,
          ),
        ),
        payload.taskDescription ? h(Text, {style: {backgroundColor: "#f8f8f6", borderRadius: "8px", color: "#55534e", fontSize: "13px", lineHeight: "1.6", margin: "20px 0 0", padding: "12px 14px", whiteSpace: "pre-wrap"}}, payload.taskDescription) : null,
      ),
    ),
  );
}
