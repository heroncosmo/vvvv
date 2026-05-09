import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminBusinessDashboardReport } from "../adminBusinessDashboard";

test("buildAdminBusinessDashboardReport consolida receita, segmentos e previsao", () => {
  const report = buildAdminBusinessDashboardReport({
    now: new Date("2026-03-13T12:00:00.000Z"),
    pendingReceiptsCount: 3,
    activePlansCount: 4,
    users: [
      {
        id: "u1",
        name: "Cliente Conectado",
        email: "u1@example.com",
        phone: "5511999999991",
        role: "user",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "u2",
        name: "Cliente Desconectado",
        email: "u2@example.com",
        phone: "5511999999992",
        role: "user",
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      },
      {
        id: "u3",
        name: "Ex-assinante",
        email: "u3@example.com",
        phone: "5511999999993",
        role: "user",
        createdAt: new Date("2025-12-15T00:00:00.000Z"),
      },
    ] as any,
    connections: [
      {
        id: "c1",
        userId: "u1",
        isConnected: true,
      },
      {
        id: "c3",
        userId: "u3",
        isConnected: true,
      },
    ] as any,
    subscriptions: [
      {
        id: "s1",
        userId: "u1",
        planId: "p1",
        status: "active",
        nextPaymentDate: new Date("2026-04-05T00:00:00.000Z"),
        createdAt: new Date("2026-01-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        plan: {
          id: "p1",
          nome: "Plano Mensal",
          valor: "100.00",
          frequenciaDias: 30,
          periodicidade: "mensal",
        },
        user: {
          id: "u1",
          name: "Cliente Conectado",
          email: "u1@example.com",
          phone: "5511999999991",
          role: "user",
        },
      },
      {
        id: "s2",
        userId: "u2",
        planId: "p1",
        status: "active",
        nextPaymentDate: new Date("2026-04-11T00:00:00.000Z"),
        createdAt: new Date("2026-02-11T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
        plan: {
          id: "p1",
          nome: "Plano Mensal",
          valor: "100.00",
          frequenciaDias: 30,
          periodicidade: "mensal",
        },
        user: {
          id: "u2",
          name: "Cliente Desconectado",
          email: "u2@example.com",
          phone: "5511999999992",
          role: "user",
        },
      },
      {
        id: "s3",
        userId: "u3",
        planId: "p2",
        status: "cancelled",
        dataFim: new Date("2026-02-20T00:00:00.000Z"),
        createdAt: new Date("2025-11-10T00:00:00.000Z"),
        updatedAt: new Date("2026-02-20T00:00:00.000Z"),
        plan: {
          id: "p2",
          nome: "Plano Promo",
          valor: "80.00",
          frequenciaDias: 30,
          periodicidade: "mensal",
        },
        user: {
          id: "u3",
          name: "Ex-assinante",
          email: "u3@example.com",
          phone: "5511999999993",
          role: "user",
        },
      },
    ] as any,
    paymentHistory: [
      {
        id: "ph1",
        subscriptionId: "s1",
        userId: "u1",
        amount: "100.00",
        netAmount: "95.00",
        status: "approved",
        paymentType: "first_payment",
        paymentDate: new Date("2026-01-10T00:00:00.000Z"),
        createdAt: new Date("2026-01-10T00:00:00.000Z"),
      },
      {
        id: "ph2",
        subscriptionId: "s1",
        userId: "u1",
        amount: "100.00",
        netAmount: "95.00",
        status: "approved",
        paymentType: "recurring",
        paymentDate: new Date("2026-02-10T00:00:00.000Z"),
        createdAt: new Date("2026-02-10T00:00:00.000Z"),
      },
      {
        id: "ph3",
        subscriptionId: "s2",
        userId: "u2",
        amount: "100.00",
        netAmount: "94.00",
        status: "approved",
        paymentType: "first_payment",
        paymentDate: new Date("2026-03-05T00:00:00.000Z"),
        createdAt: new Date("2026-03-05T00:00:00.000Z"),
      },
      {
        id: "ph4",
        subscriptionId: "s3",
        userId: "u3",
        amount: "80.00",
        netAmount: "76.00",
        status: "approved",
        paymentType: "first_payment",
        paymentDate: new Date("2025-11-10T00:00:00.000Z"),
        createdAt: new Date("2025-11-10T00:00:00.000Z"),
      },
      {
        id: "ph5",
        subscriptionId: "s3",
        userId: "u3",
        amount: "80.00",
        netAmount: "76.00",
        status: "rejected",
        paymentType: "recurring",
        paymentDate: new Date("2025-12-10T00:00:00.000Z"),
        createdAt: new Date("2025-12-10T00:00:00.000Z"),
      },
    ] as any,
  });

  assert.equal(report.overview.totalUsers, 3);
  assert.equal(report.overview.activeSubscribers, 2);
  assert.equal(report.overview.activeConnectedSubscribers, 1);
  assert.equal(report.overview.inactiveConnectedFormerSubscribers, 1);
  assert.equal(report.revenue.lifetimeGross, 380);
  assert.equal(report.revenue.currentMonthGross, 100);
  assert.equal(report.forecast.nextMonthBaseRevenue, 200);
  assert.equal(report.forecast.nextMonthBaseSubscribers, 2);
  assert.equal(report.forecast.nextMonthConnectedBaseRevenue, 100);
  assert.equal(report.renewal.connectedEligible, 2);
  assert.equal(report.renewal.connectedRenewed, 1);
  assert.equal(report.renewal.disconnectedEligible, 0);
  assert.equal(report.upcomingRenewals.length, 2);
  assert.equal(report.forecast.nextMonthWeightedRevenue, 99);
  assert.ok(
    report.forecast.nextMonthConnectedWeightedRevenue >
      report.forecast.nextMonthDisconnectedWeightedRevenue,
  );
});
