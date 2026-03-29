import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PromoteEntityDto } from './dto/promote-entity.dto';
import { DemoteEntityDto } from './dto/demote-entity.dto';

const MODEL_MAP: Record<string, string> = {
  CONTENT: 'content',
  CHECKLIST: 'checklist',
  DOCUMENT: 'document',
  CAMPAIGN: 'campaign',
  EMAIL_LIST: 'emailList',
  KEYWORD: 'keyword',
  COMPETITOR: 'competitor',
  ANALYTICS_EVENT: 'analyticsEvent',
  AB_TEST: 'aBTest',
  EMAIL_SEQUENCE: 'emailSequence',
};

@Injectable()
export class EntityLinksService {
  constructor(private prisma: PrismaService) {}

  private getDelegate(entityType: string) {
    const key = MODEL_MAP[entityType];
    if (!key) throw new NotFoundException(`Unknown entity type: ${entityType}`);
    return (this.prisma as any)[key];
  }

  async promote(dto: PromoteEntityDto, userId: string) {
    const delegate = this.getDelegate(dto.entityType);
    const entity = await delegate.findUnique({ where: { id: dto.entityId } });
    if (!entity) throw new NotFoundException('Entity not found');

    if (dto.linkType === 'LINK') {
      // Update entity scope to ORGANIZATION, keep projectId for reference
      await delegate.update({
        where: { id: dto.entityId },
        data: {
          scope: 'ORGANIZATION',
          organizationId: dto.organizationId,
        },
      });

      return this.prisma.entityLink.create({
        data: {
          entityType: dto.entityType as any,
          sourceId: dto.entityId,
          targetId: dto.entityId,
          linkType: 'LINK',
          sourceScope: 'PROJECT',
          targetScope: 'ORGANIZATION',
          createdBy: userId,
        },
      });
    }

    // COPY: create new entity at org scope
    const { id, projectId, scope, createdAt, updatedAt, ...fields } = entity;
    const newEntity = await delegate.create({
      data: {
        ...fields,
        scope: 'ORGANIZATION',
        organizationId: dto.organizationId,
        projectId: null,
      },
    });

    await this.copyNestedRelations(dto.entityType, id, newEntity.id);

    return this.prisma.entityLink.create({
      data: {
        entityType: dto.entityType as any,
        sourceId: id,
        targetId: newEntity.id,
        linkType: 'COPY',
        sourceScope: 'PROJECT',
        targetScope: 'ORGANIZATION',
        createdBy: userId,
      },
    });
  }

  async demote(dto: DemoteEntityDto, userId: string) {
    const delegate = this.getDelegate(dto.entityType);
    const entity = await delegate.findUnique({ where: { id: dto.entityId } });
    if (!entity) throw new NotFoundException('Entity not found');

    if (dto.linkType === 'LINK') {
      // Set projectId on entity, change scope to PROJECT
      await delegate.update({
        where: { id: dto.entityId },
        data: {
          scope: 'PROJECT',
          projectId: dto.projectId,
        },
      });

      return this.prisma.entityLink.create({
        data: {
          entityType: dto.entityType as any,
          sourceId: dto.entityId,
          targetId: dto.entityId,
          linkType: 'LINK',
          sourceScope: 'ORGANIZATION',
          targetScope: 'PROJECT',
          createdBy: userId,
        },
      });
    }

    // COPY: create new entity at project scope
    const { id, projectId, scope, createdAt, updatedAt, ...fields } = entity;
    const newEntity = await delegate.create({
      data: {
        ...fields,
        scope: 'PROJECT',
        projectId: dto.projectId,
        organizationId: dto.organizationId,
      },
    });

    await this.copyNestedRelations(dto.entityType, id, newEntity.id);

    return this.prisma.entityLink.create({
      data: {
        entityType: dto.entityType as any,
        sourceId: id,
        targetId: newEntity.id,
        linkType: 'COPY',
        sourceScope: 'ORGANIZATION',
        targetScope: 'PROJECT',
        createdBy: userId,
      },
    });
  }

  private async copyNestedRelations(entityType: string, sourceId: string, targetId: string) {
    switch (entityType) {
      case 'CONTENT': {
        // Copy latest ContentVersion, reset content status to DRAFT
        const latestVersion = await this.prisma.contentVersion.findFirst({
          where: { contentId: sourceId },
          orderBy: { version: 'desc' },
        });
        if (latestVersion) {
          await this.prisma.contentVersion.create({
            data: {
              contentId: targetId,
              version: 1,
              body: latestVersion.body,
              editedBy: latestVersion.editedBy,
            },
          });
        }
        await (this.prisma as any).content.update({
          where: { id: targetId },
          data: { status: 'DRAFT' },
        });
        break;
      }
      case 'CHECKLIST': {
        // Copy all ChecklistItems, reset isCompleted
        const items = await this.prisma.checklistItem.findMany({
          where: { checklistId: sourceId },
        });
        for (const item of items) {
          const { id, checklistId, createdAt, updatedAt, completedAt, completedBy, noteUpdatedBy, noteUpdatedAt, ...itemFields } = item;
          await this.prisma.checklistItem.create({
            data: {
              ...itemFields,
              checklistId: targetId,
              isCompleted: false,
              chatMessages: item.chatMessages === null ? Prisma.JsonNull : item.chatMessages,
            },
          });
        }
        break;
      }
      case 'AB_TEST': {
        // Copy ABTestVariants, reset test status to DRAFT
        const variants = await (this.prisma as any).aBTestVariant.findMany({
          where: { testId: sourceId },
        });
        for (const variant of variants) {
          const { id, testId, createdAt, updatedAt, ...variantFields } = variant;
          await (this.prisma as any).aBTestVariant.create({
            data: {
              ...variantFields,
              testId: targetId,
              impressions: 0,
              conversions: 0,
              clicks: 0,
            },
          });
        }
        await (this.prisma as any).aBTest.update({
          where: { id: targetId },
          data: { status: 'DRAFT' },
        });
        break;
      }
      case 'EMAIL_SEQUENCE': {
        // Copy EmailSequenceSteps (not enrollments)
        const steps = await this.prisma.emailSequenceStep.findMany({
          where: { sequenceId: sourceId },
        });
        for (const step of steps) {
          const { id, sequenceId, createdAt, updatedAt, ...stepFields } = step;
          await this.prisma.emailSequenceStep.create({
            data: {
              ...stepFields,
              sequenceId: targetId,
            },
          });
        }
        break;
      }
      default:
        // No nested relations to copy
        break;
    }
  }

  async findLinks(entityType: string, entityId: string) {
    return this.prisma.entityLink.findMany({
      where: {
        entityType: entityType as any,
        OR: [
          { sourceId: entityId },
          { targetId: entityId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteLink(id: string) {
    const link = await this.prisma.entityLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Entity link not found');

    if (link.linkType === 'LINK') {
      const delegate = this.getDelegate(link.entityType);
      // Revert the entity scope
      if (link.targetScope === 'ORGANIZATION') {
        // Was promoted — revert to PROJECT scope
        await delegate.update({
          where: { id: link.targetId },
          data: { scope: 'PROJECT' },
        });
      } else if (link.targetScope === 'PROJECT') {
        // Was demoted — revert to ORGANIZATION scope, clear projectId
        await delegate.update({
          where: { id: link.targetId },
          data: { scope: 'ORGANIZATION', projectId: null },
        });
      }
    }

    return this.prisma.entityLink.delete({ where: { id } });
  }
}
