import { Injectable, NotFoundException } from '@nestjs/common';

export interface Department {
  id: number;
  code: string;
  name: string;
}

@Injectable()
export class DepartmentsService {
  // In-memory storage for this lesson; replaced by Prisma later.
  private readonly departments: Department[] = [];
  private nextId = 1;

  findAll(): Department[] {
    return this.departments;
  }

  findOne(id: number): Department {
    const department = this.departments.find((d) => d.id === id);
    if (!department) {
      throw new NotFoundException(`Department ${id} not found`);
    }
    return department;
  }

  create(code: string, name: string): Department {
    const department = { id: this.nextId++, code, name };
    this.departments.push(department);
    return department;
  }
}
