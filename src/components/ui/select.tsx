import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

interface Option {
  label: string;
  value: string;
  sublabel?: string;
}

interface SelectProps {
  label?: string;
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function Select({
  label,
  value,
  options,
  onValueChange,
  placeholder = 'Seleccionar una opción...',
}: SelectProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const theme = useTheme();

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (val: string) => {
    onValueChange(val);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      {label && (
        <ThemedText type="smallBold" style={[styles.label, { color: theme.textSecondary }]}>
          {label}
        </ThemedText>
      )}

      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText
          style={[
            styles.triggerText,
            { color: selectedOption ? theme.text : theme.textSecondary },
          ]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </ThemedText>
        <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <SafeAreaView style={styles.safeArea}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <ThemedText type="smallBold" style={{ color: theme.text }}>
                  {label || 'Seleccionar opción'}
                </ThemedText>
                <Pressable
                  onPress={() => setModalVisible(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={22} color={theme.text} />
                </Pressable>
              </View>

              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isSelected = item.value === value;
                  return (
                    <Pressable
                      onPress={() => handleSelect(item.value)}
                      style={({ pressed }) => [
                        styles.optionItem,
                        {
                          borderBottomColor: theme.border,
                          backgroundColor: isSelected
                            ? theme.backgroundSelected
                            : 'transparent',
                        },
                        pressed && { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <View style={styles.optionTextContainer}>
                        <ThemedText
                          type={isSelected ? 'smallBold' : 'small'}
                          style={{ color: isSelected ? theme.primary : theme.text }}
                        >
                          {item.label}
                        </ThemedText>
                        {item.sublabel && (
                          <ThemedText
                            style={[
                              styles.optionSublabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {item.sublabel}
                          </ThemedText>
                        )}
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color={theme.primary} />
                      )}
                    </Pressable>
                  );
                }}
              />
            </SafeAreaView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const screenHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: Spacing.two,
  },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.one,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    width: '100%',
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: screenHeight * 0.6,
    width: '100%',
  },
  safeArea: {
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.one,
  },
  listContent: {
    paddingBottom: Spacing.six,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  optionTextContainer: {
    flex: 1,
    marginRight: Spacing.three,
  },
  optionSublabel: {
    fontSize: 11,
    marginTop: 4,
  },
});
