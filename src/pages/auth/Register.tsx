import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { GraduationCap, Users, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { LampToggle } from '@/components/ui/lamp-toggle';

type AccountType = 'student' | 'parent';
type Step = 'type' | 'details';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('type');
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTypeSelect = (type: AccountType) => {
    setAccountType(type);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!accountType) return;

    setLoading(true);
    try {
      await register(email, password, accountType);
      navigate('/onboarding');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="fixed top-4 right-4 z-50"><LampToggle /></div>
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 glow-radial pointer-events-none" />
        <div className="relative z-10 max-w-md px-12">
          <Link to="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <span className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-2xl font-semibold">OpenClass Learner</span>
          </Link>
          <h2 className="text-3xl font-semibold mb-4 leading-tight">
            Your AI classroom adapts to how you think
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Multi-agent AI teachers, adaptive difficulty, and real-time progress tracking — all in one place.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: 'AI Agents', value: '3+' },
              { label: 'Subjects', value: '50+' },
              { label: 'Learners', value: '4,200+' },
              { label: 'Countries', value: '38' },
            ].map((stat) => (
              <div key={stat.label} className="card-surface rounded-xl p-4">
                <div className="text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-xl font-semibold">OpenClass Learner</span>
          </Link>

          {step === 'type' ? (
            <>
              <h1 className="text-2xl font-semibold mb-2">Create your account</h1>
              <p className="text-muted-foreground mb-8">Choose how you'll use OpenClass Learner</p>

              <div className="space-y-4">
                <button
                  onClick={() => handleTypeSelect('student')}
                  className="w-full card-surface rounded-xl p-6 text-left hover:border-primary/50 transition-all group card-hover"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <GraduationCap className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">I'm a Student</h3>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        I want to learn and track my own progress. Full control over my account and dashboard.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleTypeSelect('parent')}
                  className="w-full card-surface rounded-xl p-6 text-left hover:border-primary/50 transition-all group card-hover"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">I'm a Parent</h3>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-green-500 transition-colors" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        I want to create accounts for my children and monitor their learning progress.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <p className="text-center text-sm text-muted-foreground mt-8">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('type')}
                className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1"
              >
                ← Back
              </button>

              <h1 className="text-2xl font-semibold mb-2">
                {accountType === 'parent' ? 'Create Parent Account' : 'Create Student Account'}
              </h1>
              <p className="text-muted-foreground mb-8">
                {accountType === 'parent'
                  ? "You'll be able to add your children after setup"
                  : 'Start your personalized learning journey'}
              </p>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-11 px-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="you@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full h-11 px-4 pr-11 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Min 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full h-11 px-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Re-enter your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
