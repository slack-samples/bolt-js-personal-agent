import { Usage } from '@openai/agents';

import { agent } from '../agent/index.js';

let ids = 0;

/**
 * A response that calls the tool `name` with `args`.
 * @param {string} name
 * @param {Record<string, any>} args
 */
export function call(name, args) {
  return {
    type: 'function_call',
    id: `fc_${ids++}`,
    callId: `call_${ids++}`,
    name,
    arguments: JSON.stringify(args),
    status: 'completed',
  };
}

/**
 * A response that ends the turn with `text`.
 * @param {string} text
 */
export function say(text) {
  return {
    type: 'message',
    id: `msg_${ids++}`,
    role: 'assistant',
    status: 'completed',
    content: [
      {
        type: 'output_text',
        text,
      },
    ],
  };
}

/** Answers each model call with `script(callNumber)`, counting from 1. */
export class FakeModel {
  /** @param {(callNumber: number) => any} script */
  constructor(script) {
    this.script = script;
    /** @type {any[]} */
    this.inputs = [];
    /** @type {import('@openai/agents').ModelRequest[]} */
    this.requests = [];
  }

  /** @param {import('@openai/agents').ModelRequest} request */
  async getResponse(request) {
    this.inputs.push(request.input);
    this.requests.push(request);
    const output = this.script(this.inputs.length);
    return {
      usage: new Usage(),
      output: [output],
      responseId: undefined,
    };
  }

  /** @returns {AsyncIterable<any>} */
  getStreamedResponse() {
    throw new Error('Not implemented');
  }
}

/**
 * The names of the tools offered to the model on its `callNumber`th call, counting from 1.
 * @param {FakeModel} model
 * @param {number} [callNumber]
 * @returns {string[]}
 */
export function toolNames(model, callNumber = 1) {
  return model.requests[callNumber - 1].tools.map((tool) => tool.name);
}

/**
 * The system prompt the model got on its `callNumber`th call, counting from 1.
 * @param {FakeModel} model
 * @param {number} [callNumber]
 * @returns {string}
 */
export function instructions(model, callNumber = 1) {
  return model.requests[callNumber - 1].systemInstructions ?? '';
}

/**
 * Give the agent a scripted model for this test.
 * @param {import('node:test').TestContext} t
 * @param {(callNumber: number) => any} script
 */
export function scripted(t, script) {
  const model = new FakeModel(script);
  const original = agent.model;
  agent.model = model;
  t.after(() => {
    agent.model = original;
  });
  return model;
}
