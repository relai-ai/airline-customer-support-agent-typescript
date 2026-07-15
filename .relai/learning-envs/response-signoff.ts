import {
  CodeEvaluator,
  EvaluationResult,
  FixedInput,
  RELAIEnvironment,
  SimulationResult,
} from "@relai-ai/relai";

const tags = ["end-to-end", "airline-reply-ends-with-signoff"] as const;

const requiredSignoff = "please let me know if you have any questions";

function endsWithRequiredSignoff(finalOutput: string): boolean {
  return new RegExp(
    `${escapeRegExp(requiredSignoff)}[\\p{P}\\p{S}]*$`,
    "iu",
  ).test(finalOutput.trimEnd());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarizeTail(finalOutput: string): string {
  const trimmed = finalOutput.trim();
  if (trimmed.length === 0) {
    return "(empty response)";
  }

  const tail = trimmed.slice(-140);
  return tail.length === trimmed.length ? tail : `...${tail}`;
}

export const environment = new RELAIEnvironment({
  id: "response-signoff",
  name: "Required Response Signoff",
  description: "Checks that each airline support reply ends with the required signoff phrase.",
  tags,
  input: new FixedInput({
    turns: ["What is the baggage policy for a standard ticket?"],
  }),
  mocks: {
    change_seat: async ({
      confirmation_code,
      requested_seat,
    }: {
      confirmation_code: string;
      requested_seat: string;
    }) =>
      `Seat updated to ${requested_seat.trim().toUpperCase()} for booking ${confirmation_code
        .trim()
        .toUpperCase()}.`,
  },
  evaluators: [
    new CodeEvaluator({
      id: "required-signoff",
      description: "Checks that the final reply ends with the required signoff phrase.",
      evaluate: (simulationResult: SimulationResult) => {
        const finalOutput = String(simulationResult.finalOutput ?? "");
        if (endsWithRequiredSignoff(finalOutput)) {
          return new EvaluationResult({
            score: 1,
            feedback:
              "The final reply ends with the required signoff phrase.",
          });
        }

        return new EvaluationResult({
          score: 0,
          feedback:
            'Expected the final reply to end with "Please let me know if you have any questions." with only punctuation, casing, or trailing whitespace variation, but it ended with: ' +
            `"${summarizeTail(finalOutput)}".`,
        });
      },
    }),
  ],
});
