import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from './themed-text';
import { useMobile } from '../context/MobileContext';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

const RESORT_BACKGROUNDS = [
  require('@/assets/images/resort-1.jpg'),
  require('@/assets/images/resort-2.jpg'),
  require('@/assets/images/resort-3.jpg'),
];

export function LoginScreen() {
  const { login } = useMobile();
  const theme = useTheme();

  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusedUser, setIsFocusedUser] = useState(false);
  const [isFocusedPass, setIsFocusedPass] = useState(false);

  // Background crossfade slideshow state
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0.2,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        // Change image
        setCurrentBgIndex((prev) => (prev + 1) % RESORT_BACKGROUNDS.length);
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
      });
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  const handleLogin = () => {
    setError(null);
    if (!usuario.trim() || !contrasena.trim()) {
      setError('Por favor, ingresa tu usuario y contraseña.');
      return;
    }

    const success = login(usuario, contrasena);
    if (!success) {
      setError('Credenciales no válidas. Prueba: usuario "agente" / clave "1234"');
    }
  };

  const handleFillDemo = (u: string, p: string) => {
    setUsuario(u);
    setContrasena(p);
    setError(null);
  };

  return (
    <View style={styles.mainWrapper}>
      {/* ─── Smooth Animated 3-Photo Background Slideshow (100% Screen Adapted) ─── */}
      <Animated.Image
        source={RESORT_BACKGROUNDS[currentBgIndex]}
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: fadeAnim, width: '100%', height: '100%' },
        ]}
        resizeMode="cover"
      />

      {/* Emerald Teal Blur/Gradient Overlay matching Palomas Web */}
      <LinearGradient
        colors={['rgba(13, 110, 95, 0.88)', 'rgba(7, 66, 57, 0.94)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Slide Indicators on Top Right */}
      <View style={styles.bgIndicatorsBox}>
        {RESORT_BACKGROUNDS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.bgIndicatorDot,
              currentBgIndex === i && styles.bgIndicatorDotActive,
            ]}
          />
        ))}
      </View>

      <SafeAreaView style={styles.safeContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Clean White Login Card matching Web design */}
            <View style={styles.glassCard}>
              {/* Official Logo at Top of Card */}
              <View style={styles.cardHeaderBox}>
                <Image
                  source={require('@/assets/images/logo.png')}
                  style={styles.cardLogoImg}
                  resizeMode="contain"
                />
                <ThemedText style={styles.cardMainTitle}>
                  Plataforma Operativa HOA
                </ThemedText>
                <ThemedText style={styles.cardSubTitle}>
                  Control de Accesos, Proveedores y Seguridad
                </ThemedText>
              </View>

              {error && (
                <View style={[styles.errorBox, { backgroundColor: theme.dangerBg, borderColor: theme.danger }]}>
                  <Ionicons name="alert-circle" size={18} color={theme.danger} style={{ marginRight: 6 }} />
                  <ThemedText style={[styles.errorText, { color: theme.danger }]}>{error}</ThemedText>
                </View>
              )}

              {/* User Input */}
              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Usuario / RFC Acreditado</ThemedText>
                <View
                  style={[
                    styles.inputFieldWrapper,
                    {
                      borderColor: isFocusedUser ? '#0D6E5F' : '#E2E8F0',
                    },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={isFocusedUser ? '#0D6E5F' : '#94a3b8'}
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    value={usuario}
                    onChangeText={setUsuario}
                    onFocus={() => setIsFocusedUser(true)}
                    onBlur={() => setIsFocusedUser(false)}
                    placeholder="ej. admin, supervisor, contratista, caseta"
                    placeholderTextColor="#94a3b8"
                    style={styles.textInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Contraseña</ThemedText>
                <View
                  style={[
                    styles.inputFieldWrapper,
                    {
                      borderColor: isFocusedPass ? '#0D6E5F' : '#E2E8F0',
                    },
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={isFocusedPass ? '#0D6E5F' : '#94a3b8'}
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    value={contrasena}
                    onChangeText={setContrasena}
                    onFocus={() => setIsFocusedPass(true)}
                    onBlur={() => setIsFocusedPass(false)}
                    placeholder="••••••••"
                    placeholderTextColor="#94a3b8"
                    style={styles.textInput}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeToggle}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#94a3b8"
                    />
                  </Pressable>
                </View>
              </View>

              {/* Submit Emerald Teal Button */}
              <Pressable
                onPress={handleLogin}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <ThemedText style={styles.submitBtnText}>Iniciar Sesión</ThemedText>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 6 }} />
              </Pressable>

              {/* Quick Demo Access Pill */}
              <Pressable
                onPress={() => handleFillDemo('agente', '1234')}
                style={styles.demoPill}
              >
                <Ionicons name="flash" size={13} color="#0D6E5F" style={{ marginRight: 4 }} />
                <ThemedText style={styles.demoPillText}>
                  Acceso Rápido Demo: agente / 1234
                </ThemedText>
              </Pressable>
            </View>

            {/* Bottom HOA Notice */}
            <View style={styles.footerNote}>
              <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.8)" style={{ marginRight: 6 }} />
              <ThemedText style={styles.footerNoteText}>
                © 2026 Las Palomas Rocky Point HOA, A.C. &bull; Sistema Operativo Integral
              </ThemedText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: '#074239',
  },
  safeContainer: {
    flex: 1,
  },
  bgIndicatorsBox: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  bgIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  bgIndicatorDotActive: {
    width: 14,
    backgroundColor: '#10B981',
  },
  scrollContent: {
    padding: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
  },
  glassCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    gap: 16,
  },
  cardHeaderBox: {
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  cardLogoImg: {
    width: 170,
    height: 44,
    marginBottom: 4,
  },
  cardMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  cardSubTitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputFieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
  },
  textInput: {
    flex: 1,
    height: '100%',
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '600',
  },
  eyeToggle: {
    padding: 6,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 12,
    backgroundColor: '#0D6E5F',
    marginTop: 4,
    shadowColor: '#0D6E5F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  demoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#E6F4F1',
    borderWidth: 1,
    borderColor: '#0D6E5F',
  },
  demoPillText: {
    color: '#0D6E5F',
    fontSize: 12,
    fontWeight: '800',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    maxWidth: 440,
  },
  footerNoteText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    flex: 1,
    fontWeight: '500',
  },
});
