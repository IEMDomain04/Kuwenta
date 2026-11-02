import { ThemedText } from "@/components/themed-text";
import { useAmountVisibility } from "@/hooks/amount-visibility";
import { useTheme } from "@/hooks/use-theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatTransactionDateTime, readableTransactionDate } from "../../domain/dates";
import type { Transaction } from "../../domain/types";
import type { activityWeek } from "../../reporting/dashboard";

type DailySpendingSheetProps = {
  days: ReturnType<typeof activityWeek>["days"];
  selectedRecords: readonly Transaction[];
  selectedDate: string;
  today: string;
  label: string;
  recordLimit: number;
  onSelectDate: (date: string) => void;
  onShowMore: () => void;
  onClose: () => void;
};

/** Controlled by the period overview so closing the sheet preserves its selection. */
export function DailySpendingSheet({
  days,
  selectedRecords,
  selectedDate,
  today,
  label,
  recordLimit,
  onSelectDate,
  onShowMore,
  onClose,
}: DailySpendingSheetProps) {
  const theme = useTheme();
  const { formatAmount: formatMoney, conceal } = useAmountVisibility();
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: theme.overlay,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close daily spending"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <SafeAreaView
          edges={["bottom", "left", "right"]}
          style={{
            maxHeight: height * 0.85,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: theme.backgroundElement,
          }}
        >
          <View accessibilityViewIsModal style={{ padding: 16, gap: 8 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <ThemedText
                type="smallBold"
                accessibilityRole="header"
                style={{ flex: 1 }}
              >
                Daily spending
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close daily spending"
                onPress={onClose}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
            <ScrollView
              style={{ maxHeight: height * 0.55 }}
              contentContainerStyle={{ gap: 4, paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {days.map((day) => (
                <View key={day.date}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      expanded: selectedDate === day.date,
                      disabled: day.date > today,
                    }}
                    disabled={day.date > today}
                    accessibilityLabel={
                      readableTransactionDate(day.date) +
                      ", " +
                      (day.date > today
                        ? "Upcoming"
                        : formatMoney(day.expenses) + " spent")
                    }
                    onPress={() => {
                      onSelectDate(day.date);
                    }}
                    style={{
                      minHeight: 48,
                      padding: 10,
                      borderRadius: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor:
                        selectedDate === day.date
                          ? theme.backgroundSelected
                          : theme.background,
                    }}
                  >
                    <ThemedText type="small" style={{ flex: 1 }}>
                      {readableTransactionDate(day.date)}
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      style={{ flexShrink: 1, textAlign: "right" }}
                    >
                      {day.date > today
                        ? "Upcoming"
                        : formatMoney(day.expenses)}
                    </ThemedText>
                    <Ionicons
                      name={
                        selectedDate === day.date
                          ? "chevron-up"
                          : "chevron-down"
                      }
                      size={14}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                  {selectedDate === day.date ? (
                    <View style={{ padding: 10, gap: 6 }}>
                      {!selectedRecords.length ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          No expenses recorded on this day.
                        </ThemedText>
                      ) : null}
                      {selectedRecords
                        .slice(0, recordLimit)
                        .map((record) => (
                          <Pressable
                            key={record.id}
                            accessibilityRole="button"
                            accessibilityLabel={
                              "View " +
                              conceal(
                                record.notes?.trim() || record.category,
                              ) +
                              ", " +
                              formatMoney(record.amount)
                            }
                            onPress={() => {
                              onClose();
                              router.push({
                                pathname: "/transaction",
                                params: {
                                  id: record.exchangeParentId ?? record.id,
                                },
                              });
                            }}
                            style={{
                              minHeight: 48,
                              gap: 3,
                              justifyContent: "center",
                            }}
                          >
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              <ThemedText
                                type="smallBold"
                                numberOfLines={2}
                                style={{ flex: 1 }}
                              >
                                {conceal(
                                  record.notes?.trim() || record.category,
                                )}
                              </ThemedText>
                              <ThemedText
                                type="smallBold"
                                style={{ flexShrink: 1 }}
                              >
                                {formatMoney(record.amount)}
                              </ThemedText>
                            </View>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                            >
                              {conceal(record.category)} |{" "}
                              {formatTransactionDateTime(
                                record.transactionDate,
                                record.transactionTime,
                              )}
                            </ThemedText>
                          </Pressable>
                        ))}
                      {selectedRecords.length > recordLimit ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={onShowMore
                          }
                          style={{
                            minHeight: 44,
                            justifyContent: "center",
                          }}
                        >
                          <ThemedText type="smallBold" themeColor="accent">
                            Show more transactions
                          </ThemedText>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
