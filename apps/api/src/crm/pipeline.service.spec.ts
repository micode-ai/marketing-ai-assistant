import { BadRequestException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

function makePrisma() {
  return {
    pipelineStage: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 4 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's_new', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 's1' }),
    },
    deal: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((fns: any) => Promise.all(fns)),
  };
}

describe('PipelineService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PipelineService;
  beforeEach(() => { jest.clearAllMocks(); prisma = makePrisma(); service = new PipelineService(prisma as any); });

  it('seeds the 4 default stages when a project has none, then returns them', async () => {
    prisma.pipelineStage.count.mockResolvedValue(0);
    prisma.pipelineStage.findMany
      .mockResolvedValueOnce([]) // pre-seed
      .mockResolvedValueOnce([{ id: 'a', name: 'Lead', order: 0, probability: 10 }]); // post-seed list
    await service.listStages('p1');
    expect(prisma.pipelineStage.createMany).toHaveBeenCalledTimes(1);
    const seeded = prisma.pipelineStage.createMany.mock.calls[0][0].data;
    expect(seeded).toHaveLength(4);
    expect(seeded[0]).toMatchObject({ projectId: 'p1', name: 'Lead', order: 0, probability: 10 });
    expect(seeded[3]).toMatchObject({ name: 'Negotiation', order: 3, probability: 75 });
  });

  it('does NOT seed when stages already exist', async () => {
    prisma.pipelineStage.count.mockResolvedValue(4);
    prisma.pipelineStage.findMany.mockResolvedValue([{ id: 'a', order: 0 }]);
    await service.listStages('p1');
    expect(prisma.pipelineStage.createMany).not.toHaveBeenCalled();
  });

  it('createStage appends at the next order index', async () => {
    prisma.pipelineStage.count.mockResolvedValue(4); // already seeded
    prisma.pipelineStage.findFirst.mockResolvedValue({ order: 3 }); // current max order
    await service.createStage('p1', { name: 'Closing', probability: 90 });
    const data = prisma.pipelineStage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projectId: 'p1', name: 'Closing', probability: 90, order: 4 });
  });

  it('deleteStage reassigns open deals to the previous stage and is blocked on the last stage', async () => {
    // two stages exist; deleting order-1 reassigns its deals to order-0
    prisma.pipelineStage.findFirst.mockResolvedValueOnce({ id: 's2', order: 1, projectId: 'p1' }); // the target
    prisma.pipelineStage.findMany.mockResolvedValue([{ id: 's1', order: 0 }, { id: 's2', order: 1 }]);
    await service.deleteStage('p1', 's2');
    expect(prisma.deal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stageId: 's2' }, data: { stageId: 's1' } }),
    );
    expect(prisma.pipelineStage.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
  });

  it('deleteStage throws when it is the only/last stage', async () => {
    prisma.pipelineStage.findFirst.mockResolvedValueOnce({ id: 's1', order: 0, projectId: 'p1' });
    prisma.pipelineStage.findMany.mockResolvedValue([{ id: 's1', order: 0 }]);
    await expect(service.deleteStage('p1', 's1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
