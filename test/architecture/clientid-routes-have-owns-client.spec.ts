import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../src/shared/decorators/public.decorator';
import { IS_CLIENT_AUTH_KEY } from '../../src/shared/decorators/client-auth.decorator';
import { OWNS_CLIENT_METADATA_KEY } from '../../src/shared/decorators/owns-client.decorator';
import { CONTROLLER_REGISTRY } from './controller-registry';

const SRC_ROOT = path.resolve(__dirname, '../../src');

function getControllerFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      return getControllerFiles(fullPath);
    }
    if (fullPath.endsWith('.controller.ts') && !fullPath.endsWith('.spec.ts')) {
      return [fullPath];
    }
    return [];
  });
}

function readMetadata<T = unknown>(target: object, key: string): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

/**
 * Architecture invariant: every `@ClientAuth()` route handler whose path
 * (class-level base + method-level path) contains `:clientId` MUST carry
 * either `@OwnsClient(...)` or `@Public()`. Admin-tier routes (no
 * `@ClientAuth()` on class or handler) are intentionally exempt — the
 * super-admin operating model requires admins to read across all clients
 * (e.g. `/client-agents/billing/client/:clientId`).
 *
 * Mechanism: walk the static `CONTROLLER_REGISTRY` and read decorator
 * metadata via `Reflect.getMetadata`. No Nest bootstrap, no DB. The
 * registry is a hand-maintained TS module; a count check below fails the
 * test if a new controller is added without registering it.
 */
describe('Architecture: :clientId routes carry @OwnsClient', () => {
  it('CONTROLLER_REGISTRY is in sync with src/**/*.controller.ts', () => {
    const filesOnDisk = getControllerFiles(SRC_ROOT).filter(
      (p) => !p.includes(`${path.sep}app.controller.ts`),
    );
    expect(CONTROLLER_REGISTRY.length).toBe(filesOnDisk.length);
  });

  it('every @ClientAuth() :clientId handler has @OwnsClient() or @Public()', () => {
    const offenders: string[] = [];

    for (const Controller of CONTROLLER_REGISTRY) {
      const classBasePath = readMetadata<string | string[]>(
        Controller,
        PATH_METADATA,
      );
      const classBaseArray = Array.isArray(classBasePath)
        ? classBasePath
        : classBasePath !== undefined
        ? [classBasePath]
        : [''];

      const classIsPublic = readMetadata<boolean>(Controller, IS_PUBLIC_KEY);
      const classIsClientAuth = readMetadata<boolean>(
        Controller,
        IS_CLIENT_AUTH_KEY,
      );
      const classOwns = readMetadata<string>(
        Controller,
        OWNS_CLIENT_METADATA_KEY,
      );

      const proto = Controller.prototype as Record<string, unknown>;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (n) =>
          n !== 'constructor' &&
          typeof (proto as Record<string, unknown>)[n] === 'function',
      );

      for (const methodName of methodNames) {
        const handler = (proto as Record<string, unknown>)[methodName] as (
          ...args: unknown[]
        ) => unknown;
        const methodPath = readMetadata<string | string[]>(
          handler,
          PATH_METADATA,
        );
        const methodPathArray = Array.isArray(methodPath)
          ? methodPath
          : methodPath !== undefined
          ? [methodPath]
          : [''];

        const handlerIsPublic = readMetadata<boolean>(handler, IS_PUBLIC_KEY);
        const handlerIsClientAuth = readMetadata<boolean>(
          handler,
          IS_CLIENT_AUTH_KEY,
        );
        const handlerOwns = readMetadata<string>(
          handler,
          OWNS_CLIENT_METADATA_KEY,
        );

        // Effective metadata: handler-level wins per Reflector.getAllAndOverride.
        const isPublic =
          handlerIsPublic !== undefined ? handlerIsPublic : classIsPublic;
        const isClientAuth =
          handlerIsClientAuth !== undefined
            ? handlerIsClientAuth
            : classIsClientAuth;
        const owns = handlerOwns !== undefined ? handlerOwns : classOwns;

        if (isPublic === true) continue;
        if (isClientAuth !== true) continue;

        // Build the composed path candidates (class base × method path).
        for (const base of classBaseArray) {
          for (const methodSeg of methodPathArray) {
            const composed = `/${[base, methodSeg]
              .filter((s) => typeof s === 'string' && s.length > 0)
              .join('/')}`;
            if (!composed.includes(':clientId')) continue;

            if (owns !== 'clientId') {
              offenders.push(
                `${Controller.name}#${methodName} (${composed}) is @ClientAuth() but missing @OwnsClient('clientId')`,
              );
            }
          }
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `Architecture violation: ${
          offenders.length
        } :clientId route(s) missing @OwnsClient(...):\n  ${offenders.join(
          '\n  ',
        )}`,
      );
    }
  });
});
