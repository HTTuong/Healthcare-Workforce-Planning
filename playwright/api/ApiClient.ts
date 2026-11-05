import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import type { Availability, Department, Employee, GenerateResult, Profile, Qualification, Role, Schedule, Shift, Violation } from './types';

type Body = Record<string, unknown>;

/**
 * The API as the tests use it: one client per signed in user. The raw methods return the response, so a test can
 * check any status. The domain methods expect success and return the parsed body, so setup code stays short and a
 * failed setup step says which call failed and why.
 */
export class ApiClient {
  constructor(
    readonly request: APIRequestContext,
    readonly token?: string
  ) {}

  /** Signs in and returns a client for that user. */
  static async signIn(request: APIRequestContext, email: string, password: string): Promise<ApiClient> {
    const response = await request.post('/auth/login', { data: { email, password } });
    await expectOk(response, `sign in as ${email}`);
    const { accessToken } = (await response.json()) as { accessToken: string };
    return new ApiClient(request, accessToken);
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  get(path: string) {
    return this.request.get(path, { headers: this.headers() });
  }

  post(path: string, data?: Body) {
    return this.request.post(path, { headers: this.headers(), data });
  }

  patch(path: string, data: Body) {
    return this.request.patch(path, { headers: this.headers(), data });
  }

  put(path: string, data: Body) {
    return this.request.put(path, { headers: this.headers(), data });
  }

  delete(path: string) {
    return this.request.delete(path, { headers: this.headers() });
  }

  me() {
    return this.ok<Profile>(this.get('/auth/me'), 'GET /auth/me');
  }

  readonly employees = {
    list: () => this.ok<Employee[]>(this.get('/employees'), 'GET /employees'),
    create: (body: Body) => this.ok<Employee>(this.post('/employees', body), 'POST /employees'),
    update: (id: number, body: Body) => this.ok<Employee>(this.patch(`/employees/${id}`, body), `PATCH /employees/${id}`),
    setPassword: (id: number, password: string) =>
      this.ok<void>(this.put(`/auth/password/${id}`, { password }), `PUT /auth/password/${id}`),
    assignQualification: (id: number, qualificationId: number, validUntil: string | null) =>
      this.ok<unknown>(
        this.put(`/employees/${id}/qualifications/${qualificationId}`, { validUntil }),
        `PUT /employees/${id}/qualifications/${qualificationId}`
      )
  };

  readonly availability = {
    create: (body: Body) => this.ok<Availability>(this.post('/availabilities', body), 'POST /availabilities')
  };

  readonly departments = {
    list: () => this.ok<Department[]>(this.get('/departments'), 'GET /departments'),
    create: (body: Body) => this.ok<Department>(this.post('/departments', body), 'POST /departments')
  };

  readonly qualifications = {
    list: () => this.ok<Qualification[]>(this.get('/qualifications'), 'GET /qualifications'),
    create: (body: Body) => this.ok<Qualification>(this.post('/qualifications', body), 'POST /qualifications')
  };

  readonly shifts = {
    create: (body: Body) => this.ok<Shift>(this.post('/shifts', body), 'POST /shifts')
  };

  readonly schedules = {
    create: (body: Body) => this.ok<Schedule>(this.post('/schedules', body), 'POST /schedules'),
    get: (id: number) => this.ok<Schedule>(this.get(`/schedules/${id}`), `GET /schedules/${id}`),
    check: (id: number) => this.ok<{ violations: Violation[] }>(this.get(`/schedules/${id}/check`), `GET /schedules/${id}/check`),
    generate: (id: number) => this.ok<GenerateResult>(this.post(`/schedules/${id}/generate`), `POST /schedules/${id}/generate`),
    step: (id: number, action: 'submit' | 'approve' | 'reject' | 'publish') =>
      this.ok<Schedule>(this.post(`/schedules/${id}/${action}`), `POST /schedules/${id}/${action}`)
  };

  private async ok<T>(pending: Promise<APIResponse>, what: string): Promise<T> {
    const response = await pending;
    await expectOk(response, what);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Fails with the status and the API's message, which says more than "expected true". */
export async function expectOk(response: APIResponse, what: string) {
  if (!response.ok()) {
    expect(response.ok(), `${what} answered ${response.status()}: ${await response.text()}`).toBe(true);
  }
}

export type ApiByRole = Record<Role, ApiClient>;
