import { ThemedText } from "@/components/themed-text";
import { useAmountVisibility } from "@/hooks/amount-visibility";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { View } from "react-native";

type IncomeExpenseSummaryProps = {
  income: number;
  expenses: number;
  monthly: boolean;
  paired: boolean;
  label: string;
};

export function IncomeExpenseSummary({
  income,
  expenses,
  monthly,
  paired,
  label,
}: IncomeExpenseSummaryProps) {
  const theme = useTheme();
  const { formatAmount: formatMoney } = useAmountVisibility();
  return (
    <View
      testID="income-expense-summary-card"
      style={{
        flexGrow: paired ? 42 : 0,
        flexBasis: paired ? 0 : undefined,
        minWidth: 0,
        padding: 10,
        borderRadius: 20,
        backgroundColor: theme.backgroundElement,
        gap: 4,
        justifyContent: "flex-start",
      }}
    >
      <ThemedText
        type="smallBold"
        style={{ fontSize: 13, lineHeight: 18 }}
      >
        {label}
      </ThemedText>
      {[
        {
          label: "Income",
          amount: income,
          color: theme.income,
          icon: "trending-up",
        },
        {
          label: "Expenses",
          amount: expenses,
          color: theme.expense,
          icon: "trending-down",
        },
      ].map((item) => (
        <View key={item.label} style={{ gap: 1 }}>
          <ThemedText
            type="small"
            style={{ fontSize: 10, lineHeight: 14 }}
            themeColor="textSecondary"
          >
            {item.label}
          </ThemedText>
          <View
            style={{
              flexDirection: "row",
              gap: 4,
              alignItems: "center",
            }}
          >
            <Ionicons
              name={item.icon as "trending-up" | "trending-down"}
              size={14}
              color={item.color}
            />
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              style={{
                flex: 1,
                fontSize: 16,
                lineHeight: 22,
                fontWeight: "700",
                color: item.color,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatMoney(item.amount)}
            </ThemedText>
          </View>
        </View>
      ))}
      {monthly ? (
        <View style={{ gap: 2 }}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={{ fontSize: 9, lineHeight: 14 }}
          >
            Income - expenses
          </ThemedText>
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            style={{
              fontVariant: ["tabular-nums"],
              color:
                income >= expenses
                  ? theme.income
                  : theme.expense,
            }}
          >
            {formatMoney(income - expenses)}
          </ThemedText>
        </View>
      ) : null}
      {monthly ? (
        <View style={{ gap: 3 }}>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={{ fontSize: 9, lineHeight: 12 }}
          >
            Income vs. expenses
          </ThemedText>
          <View
            testID="income-expense-comparison"
            accessible
            accessibilityRole="image"
            accessibilityLabel={
              "Recorded income " +
              formatMoney(income) +
              "; expenses " +
              formatMoney(expenses)
            }
            style={{
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              flexDirection: "row",
              backgroundColor: theme.backgroundSelected,
            }}
          >
            <View
              testID="income-comparison-segment"
              style={{
                height: 8,
                width: `${(income / Math.max(1, income + expenses)) * 100}%`,
                backgroundColor: theme.income,
              }}
            />
            <View
              testID="expense-comparison-segment"
              style={{
                height: 8,
                width: `${(expenses / Math.max(1, income + expenses)) * 100}%`,
                backgroundColor: theme.expense,
              }}
            />
          </View>
          {income || expenses ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 4,
                flexWrap: "wrap",
              }}
            >
              {[
                { label: "Income", color: theme.income },
                { label: "Expenses", color: theme.expense },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2,
                      backgroundColor: item.color,
                    }}
                  />
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={{ fontSize: 8, lineHeight: 12 }}
                  >
                    {item.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={{ fontSize: 8, lineHeight: 12 }}
            >
              No recorded activity
            </ThemedText>
          )}
        </View>
      ) : null}
    </View>
  );
}
