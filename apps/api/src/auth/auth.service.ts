import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async login(user: any) {
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const orgName = dto.organizationName || `${dto.name}'s Organization`;

    // Check if an organization with this name already exists
    const existingOrg = dto.organizationName
      ? await this.prisma.organization.findFirst({
          where: { name: { equals: dto.organizationName, mode: 'insensitive' } },
        })
      : null;

    if (existingOrg) {
      // Org exists — create user and a pending join request
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          emailVerified: false,
          memberships: {
            create: {
              organizationId: existingOrg.id,
              role: 'MEMBER',
              requestedAt: new Date(),
            },
          },
        },
      });

      return {
        ...await this.login(user),
        joinRequestPending: true,
        organizationName: existingOrg.name,
      };
    }

    // Org doesn't exist — create new org with user as OWNER
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        emailVerified: false,
        memberships: {
          create: {
            role: 'OWNER',
            joinedAt: new Date(),
            organization: {
              create: {
                name: orgName,
                slug,
                plan: 'FREE',
                subscription: {
                  create: {
                    plan: 'FREE',
                    status: 'trialing',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.login(user);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();
      return this.login(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async googleLogin(googleUser: any) {
    let user = await this.prisma.user.findUnique({ where: { email: googleUser.email } });
    if (!user) {
      const orgName = `${googleUser.name}'s Organization`;
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
      user = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.googleId,
          avatarUrl: googleUser.avatar,
          emailVerified: true,
          memberships: {
            create: {
              role: 'OWNER',
              joinedAt: new Date(),
              organization: {
                create: {
                  name: orgName,
                  slug,
                  plan: 'FREE',
                  subscription: {
                    create: {
                      plan: 'FREE',
                      status: 'trialing',
                      currentPeriodStart: new Date(),
                      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    },
                  },
                },
              },
            },
          },
        },
      });
    }
    return this.login(user);
  }
}
