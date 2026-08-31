import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase as BriefcaseBusiness, FileText, Award, Star, Lightbulb, TrendingUp } from 'lucide-react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
}

const CreativeVisual: React.FC = () => {
  const [particles, setParticles] = useState<Particle[]>([]);
  
  useEffect(() => {
    // Generate random particles for the background
    const colors = ['#FACC15', '#EAB308', '#92400E', '#F59E0B'];
    const newParticles: Particle[] = [];
    
    for (let i = 0; i < 50; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    
    setParticles(newParticles);
  }, []);
  
  const icons = [
    { Icon: FileText, delay: 0.1 },
    { Icon: Award, delay: 0.2 },
    { Icon: BriefcaseBusiness, delay: 0.3 },
    { Icon: Star, delay: 0.4 },
    { Icon: Lightbulb, delay: 0.5 },
    { Icon: TrendingUp, delay: 0.6 },
  ];

  return (
    <div className="relative w-full h-full min-h-[400px] lg:min-h-screen gradient-bg flex items-center justify-center overflow-hidden">
      {/* Background Particles */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="particle"
          style={{
            backgroundColor: particle.color,
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
          }}
          animate={{
            x: [0, Math.random() * 60 - 30, 0],
            y: [0, Math.random() * 60 - 30, 0],
          }}
          transition={{
            duration: Math.random() * 10 + 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      
      {/* Main Visual Content */}
      <div className="relative z-10 max-w-lg mx-auto p-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl sm:text-5xl font-bold mb-6 text-white"
        >
          Build Your <span className="text-amber-300">Career</span> Story
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg text-stone-400 mb-10"
        >
          Create a resume that stands out, highlights your strengths, and lands you the perfect job.
        </motion.p>
        
        {/* Floating Elements */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {icons.map(({ Icon, delay }, index) => (
            <motion.div
              key={index}
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay }}
            >
              <motion.div
                className="w-16 h-16 flex items-center justify-center bg-stone-900/80 rounded-xl mb-2 border border-stone-700"
                whileHover={{ 
                  scale: 1.05, 
                  backgroundColor: "rgba(120, 113, 108, 0.15)",
                  borderColor: "#FACC15" 
                }}
                animate={{ y: [0, -8, 0] }}
                transition={{ 
                  y: { 
                    duration: 2.5, 
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                    delay: index * 0.2
                  } 
                }}
              >
                <Icon size={28} className="text-amber-300" />
              </motion.div>
            </motion.div>
          ))}
        </div>
        
        {/* Resume Preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative mx-auto w-64 h-80 bg-stone-900/80 rounded-lg shadow-2xl shadow-amber-900/20 overflow-hidden card-border"
        >
          <div className="absolute top-0 left-0 w-full h-12 bg-gradient-to-r from-amber-600 to-amber-500"></div>
          <div className="absolute top-12 left-0 p-3 w-full">
            <div className="h-3 w-3/4 bg-stone-700 rounded-full mb-2"></div>
            <div className="h-3 w-1/2 bg-stone-700 rounded-full mb-6"></div>
            
            <div className="flex items-start mb-4">
              <div className="w-8 h-8 bg-amber-400/10 rounded-full flex items-center justify-center mr-2">
                <User size={16} className="text-amber-300" />
              </div>
              <div className="flex-1">
                <div className="h-2 bg-stone-700 rounded-full mb-1"></div>
                <div className="h-2 w-3/4 bg-stone-700 rounded-full"></div>
              </div>
            </div>
            
            <div className="flex items-start mb-4">
              <div className="w-8 h-8 bg-amber-400/10 rounded-full flex items-center justify-center mr-2">
                <BriefcaseBusiness size={16} className="text-amber-300" />
              </div>
              <div className="flex-1">
                <div className="h-2 bg-stone-700 rounded-full mb-1"></div>
                <div className="h-2 w-2/4 bg-stone-700 rounded-full"></div>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="w-8 h-8 bg-amber-400/10 rounded-full flex items-center justify-center mr-2">
                <Award size={16} className="text-amber-300" />
              </div>
              <div className="flex-1">
                <div className="h-2 bg-stone-700 rounded-full mb-1"></div>
                <div className="h-2 w-3/5 bg-stone-700 rounded-full"></div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// User icon for the resume preview
const User = ({ size, className }: { size: number, className: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default CreativeVisual;