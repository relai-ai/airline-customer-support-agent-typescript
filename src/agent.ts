import { anthropic } from '@ai-sdk/anthropic';
import {
  Agent,
  run,
  setTracingDisabled,
  tool,
  type AgentInputItem,
} from '@openai/agents';
import { aisdk } from '@openai/agents-extensions/ai-sdk';
import { z } from 'zod';

import { selectModel } from './models.js';
import type { ChatMessage } from './sessions.js';

interface Booking {
  passenger: string;
  route: string;
  departure: string;
  seat: string;
  status: string;
}

const BOOKINGS: Record<string, Booking> = {
  SKY123: {
    passenger: 'Maya Chen',
    route: 'JFK to SFO',
    departure: '2026-07-14 09:30',
    seat: '12A',
    status: 'confirmed',
  },
  BAY777: {
    passenger: 'Noah Patel',
    route: 'LAX to SEA',
    departure: '2026-07-18 16:45',
    seat: '18C',
    status: 'confirmed',
  },
};

/**
 * Coerce a tool argument to a trimmed string.
 *
 * Under the Agents SDK's strict-schema handling a model may send `null`
 * (or omit a field) for a tool argument, so `execute` can receive a value
 * that is not the string the Zod type promises. Normalizing here keeps the
 * tools from throwing on `undefined`/`null` and lets them return a graceful
 * response instead.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function lookupBookingText(confirmationCode: unknown): string {
  const code = asText(confirmationCode).toUpperCase();
  if (!code) {
    return 'Please share a confirmation code so I can look up the booking.';
  }
  const booking = BOOKINGS[code];
  if (booking === undefined) {
    return 'No booking was found for that confirmation code.';
  }
  return (
    `${booking.passenger} is booked on ${booking.route} departing ` +
    `${booking.departure}. Seat ${booking.seat}. Status: ${booking.status}.`
  );
}

export function baggagePolicyText(ticketType: unknown): string {
  const normalized = (asText(ticketType) || 'standard').toLowerCase();
  if (normalized === 'basic' || normalized === 'basic economy') {
    return 'Basic economy includes one personal item. Carry-on bags and checked bags require a fee.';
  }
  if (
    normalized === 'business' ||
    normalized === 'first' ||
    normalized === 'premium'
  ) {
    return 'Premium cabins include one carry-on and two checked bags up to 70 pounds each.';
  }
  return 'Standard tickets include one carry-on and one checked bag up to 50 pounds.';
}

export function changeSeatText(
  confirmationCode: unknown,
  requestedSeat: unknown,
): string {
  const code = asText(confirmationCode).toUpperCase();
  const booking = code ? BOOKINGS[code] : undefined;
  if (booking === undefined) {
    return 'Seat changes require a valid confirmation code.';
  }
  const seat = asText(requestedSeat).toUpperCase();
  if (!seat) {
    return 'Please tell me which seat you would like.';
  }
  booking.seat = seat;
  return `Seat updated to ${seat} for booking ${code}.`;
}

const lookupBooking = tool({
  name: 'lookup_booking',
  description: 'Look up a demo booking by confirmation code.',
  parameters: z.object({
    confirmation_code: z.string(),
  }),
  execute: ({ confirmation_code }) => lookupBookingText(confirmation_code),
});

const baggagePolicy = tool({
  name: 'baggage_policy',
  description: 'Return the demo airline baggage policy for a ticket type.',
  parameters: z.object({
    ticket_type: z.string().nullable().default('standard'),
  }),
  execute: ({ ticket_type }) => baggagePolicyText(ticket_type),
});

const changeSeat = tool({
  name: 'change_seat',
  description:
    'Change a seat for a demo booking when the confirmation code is valid.',
  parameters: z.object({
    confirmation_code: z.string(),
    requested_seat: z.string(),
  }),
  execute: ({ confirmation_code, requested_seat }) =>
    changeSeatText(confirmation_code, requested_seat),
});

export const AIRLINE_AGENT_INSTRUCTIONS =
  'You are a concise airline customer support agent for a demo airline. ' +
  'Help with booking lookups, baggage policy, seat changes, and flight-change guidance. ' +
  'Before changing seats or discussing a specific booking, ask for and verify the confirmation code. ' +
  'Do not invent refund amounts, flight availability, fees, or policy exceptions. ' +
  'Answer naturally and keep responses brief.';

export function createAirlineAgent(): Agent {
  const selection = selectModel();
  const model =
    selection.provider === 'anthropic' && selection.model
      ? (setTracingDisabled(true), aisdk(anthropic(selection.model)))
      : undefined;

  return new Agent({
    name: 'SkyServe Airline Support',
    instructions: AIRLINE_AGENT_INSTRUCTIONS,
    tools: [lookupBooking, baggagePolicy, changeSeat],
    ...(model ? { model } : {}),
  });
}

function messagesToAgentInput(
  messages: Iterable<ChatMessage>,
): AgentInputItem[] {
  const input: AgentInputItem[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      input.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant') {
      input.push({
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: message.content }],
      });
    }
  }
  return input;
}

export async function* streamAgentResponse(
  messages: Iterable<ChatMessage>,
): AsyncGenerator<string> {
  const stream = await run(
    createAirlineAgent(),
    messagesToAgentInput(messages),
    { stream: true },
  );

  for await (const event of stream) {
    if (
      event.type === 'raw_model_stream_event' &&
      event.data.type === 'output_text_delta' &&
      event.data.delta
    ) {
      yield event.data.delta;
    }
  }

  await stream.completed;
}
