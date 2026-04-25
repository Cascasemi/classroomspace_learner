import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api, type OnboardingData } from '@/lib/api';
import { User, BookOpen, School, Sparkles, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { LampToggle } from '@/components/ui/lamp-toggle';

const GRADES = [
  'Kindergarten',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12',
  'College Freshman', 'College Sophomore', 'College Junior', 'College Senior',
  'Graduate',
];

const steps = [
  { id: 'name', icon: User, label: 'Your Name' },
  { id: 'details', icon: BookOpen, label: 'About You' },
  { id: 'school', icon: School, label: 'School Info' },
  { id: 'ready', icon: Sparkles, label: 'All Set!' },
];

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<OnboardingData>({
    preferredName: user?.preferredName || '',
    age: user?.age || 10,
    grade: user?.grade || '',
    programOfStudy: user?.programOfStudy || '',
    school: user?.school || '',
  });

  const update = (field: keyof OnboardingData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.preferredName.trim().length > 0;
      case 1:
        return formData.age > 0 && formData.grade.length > 0;
      case 2:
        return true; // school/program are optional
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');
    try {
      const { user: updatedUser } = await api.completeOnboarding(formData);
      updateUser(updatedUser);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="fixed top-4 right-4 z-50"><LampToggle /></div>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="text-xl font-semibold">Openclass_learner</span>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-10">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  i < currentStep
                    ? 'bg-primary text-primary-foreground'
                    : i === currentStep
                    ? 'bg-primary/20 text-primary ring-2 ring-primary'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {i < currentStep ? <Check size={14} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 ${
                    i < currentStep ? 'bg-primary' : 'bg-secondary'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="card-surface rounded-2xl p-8">
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">What should we call you?</h2>
                <p className="text-muted-foreground text-sm">
                  This is how your AI teacher and classmates will address you.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Preferred Name</label>
                <input
                  type="text"
                  value={formData.preferredName}
                  onChange={(e) => update('preferredName', e.target.value)}
                  className="w-full h-12 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg"
                  placeholder="e.g. Alex, Jordan, Sam"
                  autoFocus
                />
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Tell us about yourself</h2>
                <p className="text-muted-foreground text-sm">
                  This helps us personalize your learning experience.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Age</label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => update('age', parseInt(e.target.value) || 0)}
                  min={4}
                  max={100}
                  className="w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Grade Level</label>
                <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-2">
                  {GRADES.map((grade) => (
                    <button
                      key={grade}
                      onClick={() => update('grade', grade)}
                      className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                        formData.grade === grade
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background border border-border text-foreground hover:border-primary/50'
                      }`}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">School Information</h2>
                <p className="text-muted-foreground text-sm">
                  Optional — helps us match you with the right curriculum.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Program of Study</label>
                <input
                  type="text"
                  value={formData.programOfStudy}
                  onChange={(e) => update('programOfStudy', e.target.value)}
                  className="w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="e.g. STEM, General, AP Track (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">School Name</label>
                <input
                  type="text"
                  value={formData.school}
                  onChange={(e) => update('school', e.target.value)}
                  className="w-full h-11 px-4 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="e.g. Lincoln High School (optional)"
                />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  You're all set, {formData.preferredName}!
                </h2>
                <p className="text-muted-foreground text-sm">
                  Your AI classroom is ready. Let's start learning!
                </p>
              </div>
              <div className="card-surface rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{formData.preferredName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Age</span>
                  <span className="font-medium">{formData.age}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Grade</span>
                  <span className="font-medium">{formData.grade}</span>
                </div>
                {formData.programOfStudy && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Program</span>
                    <span className="font-medium">{formData.programOfStudy}</span>
                  </div>
                )}
                {formData.school && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">School</span>
                    <span className="font-medium">{formData.school}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            {currentStep > 0 ? (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Enter Dashboard'} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
