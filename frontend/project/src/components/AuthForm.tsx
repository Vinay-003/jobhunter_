import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Eye, EyeOff, Briefcase as BriefcaseBusiness } from 'lucide-react';
import axios from 'axios';

interface AuthFormProps {
  type: 'login' | 'signup';
}

interface SignupResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    id: number;
    username: string;
    email: string;
  };
}

const AuthForm: React.FC<AuthFormProps> = ({ type }) => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (type === 'signup') {       
        const response = await axios.post<SignupResponse>('http://localhost:3001/api/auth/signup', {
          username: name,
          email,
          password
        });

        if (response.data.success) {
          // Redirect to login page after successful signup
          navigate('/login');
        } else {
          setError(response.data.message || 'Signup failed');
        }
      } else {
        // Login logic
        const response = await axios.post<SignupResponse>('http://localhost:3001/api/auth/login', {
          email,
          password
        });

        if (response.data.success && response.data.token) {
          // Store token and user data
          localStorage.setItem('token', response.data.token);
          localStorage.setItem('user', JSON.stringify(response.data.user));
          // Redirect to home page
          navigate('/home');
        } else {
          setError(response.data.message || 'Login failed');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed');
      console.error('Error during authentication:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // funtionn to see password during login .. no logic just ulta
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <div className="mb-10 text-center">
        <div className="flex justify-center mb-4">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 10 
            }}
          >
            <BriefcaseBusiness size={48} className="text-amber-400" />
          </motion.div>
        </div>
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-amber-300 to-amber-500 text-transparent bg-clip-text" style={{ fontFamily: 'Fraunces, serif' }}>
          {type === 'login' ? 'Welcome Back' : 'Create Account'}
        </h1>
        <p className="text-stone-500">
          {type === 'login' 
            ? 'Sign in to access your professional profile' 
            : 'Start your professional journey with us'}
        </p>
      </div>

      <div className="card-border bg-stone-900/70 p-8">
        <form onSubmit={handleSubmit}>
          {type === 'signup' && (
            <div className="mb-6">
              <label htmlFor="name" className="block text-sm font-medium text-stone-400 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-stone-500" />
                </div>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="auth-input pl-10"
                  placeholder="Radheshyam Sharma"
                  required
                />
              </div>
            </div>
          )}
          
          <div className="mb-6">
            <label htmlFor="email" className="block text-sm font-medium text-stone-400 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-stone-500" />
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input pl-10"
                placeholder="email@example.com"
                required
              />
            </div>
          </div>
          
          <div className="mb-8">
            <label htmlFor="password" className="block text-sm font-medium text-stone-400 mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-stone-500" />
              </div>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input pl-10 pr-10"
                placeholder="••••••••"
                required
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="text-stone-500 hover:text-stone-300 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <motion.button
            type="submit"
            className="auth-btn"
            whileTap={{ scale: 0.98 }}
            whileHover={{ 
              boxShadow: "0 0 15px rgba(250, 204, 21, 0.35)",
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : type === 'login' ? 'Sign In' : 'Create Account'}
          </motion.button>
          
          {error && (
            <div className="mt-4 text-amber-200 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2 text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="mt-6 text-center text-sm">
            {type === 'login' ? (
              <p>
                Don't have an account?{' '}
                <Link to="/signup" className="auth-link">
                  Sign up
                </Link>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <Link to="/login" className="auth-link">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default AuthForm;