import { Logger } from '@nestjs/common';
import {
  createRecordLeadQualificationTool,
  RECORD_LEAD_QUALIFICATION_TOOL_DESCRIPTION,
} from './record-lead-qualification.tool';
import type { AgentToolRunCorrelation } from '@agent/tooling/agent-tool-run-correlation';

describe('createRecordLeadQualificationTool', () => {
  const correlation: AgentToolRunCorrelation = {
    clientId: 'c1',
    conversationId: 'conv1',
    agentId: 'a1',
    channelId: 'ch1',
    contactId: 'ct1',
    toolingProfileId: 'lead-qualifier',
    agentKind: 'lead_qualifier',
  };

  let logger: Logger;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('test');
    logSpy = jest.spyOn(logger, 'log').mockImplementation();
    errorSpy = jest.spyOn(logger, 'error').mockImplementation();
  });

  afterEach(() => {
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it('exposes the canonical description verbatim', () => {
    const bootstrap = { applyUpdate: jest.fn() };
    const t = createRecordLeadQualificationTool(
      logger,
      correlation,
      bootstrap as any,
    );
    expect(t.description).toBe(RECORD_LEAD_QUALIFICATION_TOOL_DESCRIPTION);
  });

  it('returns { ok: false, error: "no fields to record" } on empty input', async () => {
    const bootstrap = { applyUpdate: jest.fn() };
    const t = createRecordLeadQualificationTool(
      logger,
      correlation,
      bootstrap as any,
    );
    const result = await (t.execute as any)({});
    expect(result).toEqual({ ok: false, error: 'no fields to record' });
    expect(bootstrap.applyUpdate).not.toHaveBeenCalled();
  });

  it('calls leadBootstrapService.applyUpdate and returns { ok: true, state } on populated input', async () => {
    const bootstrap = {
      applyUpdate: jest.fn().mockResolvedValue({ state: 'qualified' }),
    };
    const t = createRecordLeadQualificationTool(
      logger,
      correlation,
      bootstrap as any,
    );

    const result = await (t.execute as any)({
      intent: 'demo',
      budget: { amount: 5000, currency: 'USD' },
      timeline: { horizon: 'Q3 2026' },
    });

    expect(bootstrap.applyUpdate).toHaveBeenCalledWith({
      clientId: 'c1',
      conversationId: 'conv1',
      input: {
        fields: {
          intent: 'demo',
          budget: { amount: 5000, currency: 'USD' },
          timeline: { horizon: 'Q3 2026' },
        },
        disqualify: undefined,
      },
    });
    expect(result).toEqual({ ok: true, state: 'qualified' });
  });

  it('returns { ok: false, error: <message> } when bootstrap throws', async () => {
    const bootstrap = {
      applyUpdate: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const t = createRecordLeadQualificationTool(
      logger,
      correlation,
      bootstrap as any,
    );

    const result = await (t.execute as any)({ intent: 'demo' });
    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('forwards disqualify=true even with no other fields', async () => {
    const bootstrap = {
      applyUpdate: jest.fn().mockResolvedValue({ state: 'disqualified' }),
    };
    const t = createRecordLeadQualificationTool(
      logger,
      correlation,
      bootstrap as any,
    );

    const result = await (t.execute as any)({ disqualify: true });
    expect(bootstrap.applyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ disqualify: true }),
      }),
    );
    expect(result).toEqual({ ok: true, state: 'disqualified' });
  });
});
