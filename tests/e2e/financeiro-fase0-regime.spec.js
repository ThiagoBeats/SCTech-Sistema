// Regime tributario e aliquota estimada no cadastro da empresa.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

test('regime e aliquota sao salvos e recarregados', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'Lírio Cortinas' } });
    await page.goto(BASE + '/empresa.html');
    await page.selectOption('#emp-regime', 'Simples Nacional');
    await page.fill('#emp-aliquota', '6,5');
    await page.click('text=Salvar Configurações');
    const emp = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')));
    expect(emp.regime_tributario).toBe('Simples Nacional');
    expect(emp.aliquota_estimada).toBe(6.5);
    await page.reload();
    await expect(page.locator('#emp-regime')).toHaveValue('Simples Nacional');
    await expect(page.locator('#emp-aliquota')).toHaveValue('6.5');
});

test('salvar dados da empresa nao apaga regime nem campos que a tela nao tem', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'Lírio Cortinas', campo_extra: 'fica', regime_tributario: 'MEI', aliquota_estimada: 4 } });
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#emp-regime')).toHaveValue('MEI');
    await page.fill('#emp-fantasia', 'lirio');
    await page.click('text=Salvar Configurações');
    const emp = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')));
    expect(emp.campo_extra).toBe('fica');
    expect(emp.regime_tributario).toBe('MEI');
    expect(emp.aliquota_estimada).toBe(4);
    expect(emp.nome_fantasia).toBe('LIRIO');
});
