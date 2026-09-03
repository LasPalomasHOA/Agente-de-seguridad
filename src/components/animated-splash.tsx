import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface AnimatedSplashProps {
  onFinish?: () => void;
  minDurationMs?: number;
}

export function AnimatedSplashScreen({
  onFinish,
  minDurationMs = 1500,
}: AnimatedSplashProps) {
  // Animation values
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(18)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const containerScale = useRef(new Animated.Value(1)).current;
  const [statusMessage, setStatusMessage] = useState('Iniciando sistema...');

  useEffect(() => {
    let isMounted = true;

    async function startAnimationSequence() {
      try {
        // Hide the native static splash screen immediately
        await SplashScreen.hideAsync();
      } catch (err) {
        console.warn('Error hiding native splash screen:', err);
      }

      // Step 1: Animate Logo In
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 45,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();

      // Step 2: Animate Typography In
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          delay: 250,
          useNativeDriver: true,
        }),
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 600,
          delay: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Step 3: Animate Progress Bar
      Animated.timing(progressWidth, {
        toValue: 1,
        duration: minDurationMs - 350,
        delay: 150,
        useNativeDriver: false,
      }).start();

      // Status messages sequence
      setTimeout(() => {
        if (isMounted) setStatusMessage('Verificando credenciales de acceso...');
      }, 400);

      setTimeout(() => {
        if (isMounted) setStatusMessage('Cargando módulos de seguridad...');
      }, 900);

      // Step 4: Exit Animation (Smooth Fade + Subtle Zoom Out)
      setTimeout(() => {
        if (!isMounted) return;
        setStatusMessage('¡Bienvenido!');

        Animated.parallel([
          Animated.timing(containerOpacity, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(containerScale, {
            toValue: 1.05,
            duration: 350,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (onFinish) {
            onFinish();
          }
        });
      }, minDurationMs);
    }

    startAnimationSequence();

    return () => {
      isMounted = false;
    };
  }, []);

  const progressInterpolate = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerOpacity,
          transform: [{ scale: containerScale }],
        },
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['#021B18', '#042F2E', '#0D6E5F', '#042F2E']}
        locations={[0, 0.35, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative Aura */}
      <View style={styles.glowAura} />

      <View style={styles.contentWrap}>
        {/* Official Logo Card */}
        <Animated.View
          style={[
            styles.logoCard,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* App Title Section */}
        <Animated.View
          style={[
            styles.textWrap,
            {
              opacity: textOpacity,
              transform: [{ translateY: textSlide }],
            },
          ]}
        >
          <Text style={styles.appTitle}>CONTROL DE ACCESO Y SANCIONES</Text>
          <Text style={styles.brandSubtitle}>LAS PALOMAS ROCKY POINT HOA</Text>

          {/* Color accents banner */}
          <View style={styles.accentColorsRow}>
            <View style={[styles.colorPill, { backgroundColor: '#DC2626' }]} />
            <View style={[styles.colorPill, { backgroundColor: '#059669' }]} />
            <View style={[styles.colorPill, { backgroundColor: '#F59E0B' }]} />
          </View>
        </Animated.View>

        {/* Progress Bar & Status */}
        <View style={styles.footerWrap}>
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressInterpolate },
              ]}
            >
              <LinearGradient
                colors={['#DC2626', '#059669', '#F59E0B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#042F2E',
  },
  glowAura: {
    position: 'absolute',
    width: Math.min(width * 0.9, 360),
    height: Math.min(width * 0.9, 360),
    borderRadius: 180,
    backgroundColor: '#0D6E5F',
    opacity: 0.35,
  },
  contentWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 400,
  },
  logoCard: {
    width: 170,
    height: 170,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  textWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  brandSubtitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#99F6E4',
    letterSpacing: 1.8,
    marginTop: 6,
    textAlign: 'center',
  },
  accentColorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  colorPill: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  footerWrap: {
    width: '82%',
    alignItems: 'center',
    gap: 10,
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  statusText: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
