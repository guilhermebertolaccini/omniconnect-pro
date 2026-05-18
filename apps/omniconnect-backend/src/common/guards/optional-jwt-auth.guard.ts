import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT guard que aceita rotas sem authorization header. Usado em rotas semi-públicas
 * (ex.: `POST /tenant-invitations/by-token/:token/accept`) onde o caller PODE ser
 * autenticado — e nesse caso o user é resolvido — mas a rota também aceita caller
 * anônimo com password no body.
 *
 * Importante: se houver Bearer token e ele for INVÁLIDO, propagamos o 401. Só o
 * caso "sem header" cai no fluxo anônimo. Isso evita "downgrade silencioso" de
 * um token estragado para anônimo.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers?: Record<string, string> }>();
    const header = req?.headers?.authorization || req?.headers?.Authorization;
    if (!header) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err) throw err;
    return user as TUser;
  }
}
