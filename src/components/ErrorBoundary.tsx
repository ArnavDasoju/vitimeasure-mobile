/**
 * ErrorBoundary — React class component
 *
 * Catches rendering errors anywhere in the child tree and displays
 * a safe fallback UI instead of a blank screen or crash.
 *
 * Usage (root):
 *   <ErrorBoundary><App /></ErrorBoundary>
 *
 * Usage (scoped, with custom fallback):
 *   <ErrorBoundary fallback={<Text>Chart unavailable</Text>}>
 *     <LineChart ... />
 *   </ErrorBoundary>
 */

import React from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, radii, spacing, typography } from '../theme'

type Props = {
  children: React.ReactNode
  /** Optional custom fallback. When provided, replaces the default error UI. */
  fallback?: React.ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught rendering error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>Please restart the app.</Text>
        <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    backgroundColor: colors.bgPage,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
    lineHeight: 22,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
  },
  buttonText: {
    color: colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
})
