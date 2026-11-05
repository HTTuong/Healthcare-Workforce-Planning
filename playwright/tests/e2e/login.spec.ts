import { expect, test } from '../../fixtures/test';
import { credentials } from '../../factories/users';
import { AppShell } from '../../pages/AppShell';
import { LoginPage } from '../../pages/LoginPage';

test.describe('login page', { tag: '@smoke' }, () => {
  test('signs in through the form and shows the home page', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    const { email, password } = credentials('PLANNER');
    await login.signIn(email, password);
    await expect(page.getByRole('heading', { name: 'Welcome, Pia' })).toBeVisible();
    await expect(new AppShell(page).roleBadge).toHaveText('Planner');
  });

  test('asks for both fields without calling the API', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });
    const login = new LoginPage(page);
    await login.goto();
    await login.submit.click();
    await expect(login.fieldError('Enter your email address.')).toBeVisible();
    await expect(login.fieldError('Enter your password.')).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('shows one message for a wrong password and clears the field', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(credentials('EMPLOYEE').email, 'Wrong-Password-1');
    await expect(login.alert).toHaveText('Email or password is incorrect.');
    await expect(login.password).toHaveValue('');
  });

  test('signing out returns to the login page', async ({ signInAs }) => {
    const page = await signInAs('MANAGER');
    const shell = new AppShell(page);
    await shell.signOut();
    await expect(new LoginPage(page).heading).toBeVisible();
  });
});
