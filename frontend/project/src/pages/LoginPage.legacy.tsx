import React from 'react';
import AuthForm from '../components/AuthForm';
import CreativeVisual from '../components/CreativeVisual';

const LoginPage: React.FC = () => {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <div className="lg:w-1/2 xl:w-3/5 order-2 lg:order-1">
        <CreativeVisual />
      </div>
      <div className="lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 order-1 lg:order-2">
        <AuthForm type="login" />
      </div>
    </div>
  );
};

export default LoginPage;