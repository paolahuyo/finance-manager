export interface IDebt {
  id: number;
  name: string;
  amount: number;
  interest_rate: number;
  min_payment?: number | null;
}

interface DebtAllocation {
  debtId: number;
  debtName: string;
  minPayment: number;
  suggestedPayment: number;
  debtAmount: number;
  interestRate: number;
}

interface StrategyResult {
  strategy: 'snowball' | 'avalanche';
  availableAmount: number;
  allocation: DebtAllocation[];
  remainingAmount: number;
  totalDebts: number;
  successRate: number;
}

/**
 * Calculates debt repayment strategy
 */
export function calculateStrategy(
  debts: IDebt[],
  availableAmount: number,
  strategy: 'snowball' | 'avalanche' = 'snowball'
): StrategyResult {
  if (!debts || debts.length === 0) {
    return {
      strategy,
      availableAmount,
      allocation: [],
      remainingAmount: availableAmount,
      totalDebts: 0,
      successRate: 0
    };
  }

  let sortedDebts: IDebt[];

  if (strategy === 'snowball') {
    // Sort by amount (smallest first)
    sortedDebts = [...debts].sort((a, b) => a.amount - b.amount);
  } else if (strategy === 'avalanche') {
    // Sort by interest rate (highest first)
    sortedDebts = [...debts].sort((a, b) => b.interest_rate - a.interest_rate);
  } else {
    sortedDebts = debts;
  }

  const allocation: DebtAllocation[] = [];
  let remainingAmount = availableAmount;

  for (const debt of sortedDebts) {
    if (remainingAmount <= 0) break;

    const minPayment = debt.min_payment || 0;
    const payAmount = Math.min(remainingAmount, debt.amount);

    allocation.push({
      debtId: debt.id,
      debtName: debt.name,
      minPayment,
      suggestedPayment: payAmount,
      debtAmount: debt.amount,
      interestRate: debt.interest_rate
    });

    remainingAmount -= payAmount;
  }

  return {
    strategy,
    availableAmount,
    allocation,
    remainingAmount,
    totalDebts: debts.length,
    successRate: allocation.length === debts.length ? 100 : (allocation.length / debts.length) * 100
  };
}
