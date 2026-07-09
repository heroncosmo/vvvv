import { useState, useEffect } from "react";
import { 
  Star, 
  Quote, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  Users,
  Award,
  CheckCircle2
} from "lucide-react";

export default function TestimonialsFindeas() {
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  
  const testimonials = [
    {
      name: "Carlos Silva",
      role: "Dono de E-commerce",
      company: "TechStore Brasil",
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&crop=face",
      content: "O AgenteZap transformou completamente nossas vendas. Antes respondíamos manualmente e perdíamos 60% dos clientes. Hoje a IA atende 24/7 e nossas vendas aumentaram 340% no primeiro mês.",
      rating: 5,
      result: "+340% vendas"
    },
    {
      name: "Mariana Santos",
      role: "Agente Imobiliária",
      company: "Imobiliária Luxus",
      image: "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=60&h=60&fit=crop&crop=face",
      content: "Incrível! A IA qualifica leads enquanto durmo. Chego na manhã e já tenho clientes prontos para visitar imóveis. Meu faturamento triplicou em 45 dias.",
      rating: 5,
      result: "+300% faturamento"
    },
    {
      name: "Roberto Costa",
      role: "Consultor Financeiro",
      company: "RC Investimentos",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&crop=face",
      content: "O melhor investimento que fizeste ano. A IA agenda minhas consultas e faz pré-qualificação. Poupo 20 horas semanais e atendo mais clientes.",
      rating: 5,
      result: "+20h/semana economizadas"
    },
    {
      name: "Ana Beatriz",
      role: "Dentista",
      company: "Clínica Sorriso Perfeito",
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=60&h=60&fit=crop&crop=face",
      content: "Nossas pacientes amam o atendimento rápido. A IA confirma horários, tira dúvidas e até faz lembretes. Lotamos a agenda por 3 meses adiantado!",
      rating: 5,
      result: "100% ocupação"
    }
  ];

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentTestimonial((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  useEffect(() => {
    const interval = setInterval(nextTestimonial, 5000);
    return () => clearInterval(interval);
  }, []);

  const stats = [
    {
      value: "2.847+",
      label: "Empresas Transformadas",
      icon: Users,
      color: "text-primary"
    },
    {
      value: "98%",
      label: "Taxa de Satisfação",
      icon: Award,
      color: "text-success"
    },
    {
      value: "+340%",
      label: "Média de Crescimento",
      icon: TrendingUp,
      color: "text-info"
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-neutral-900 mb-6">
              +2.847 empresas{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">vendendo mais</span>{" "}
              com AgenteZap
            </h2>
            <p className="text-xl text-neutral-600 max-w-3xl mx-auto">
              Descubra histórias reais de transformação e crescimento exponencial
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="bg-neutral-50 rounded-2xl p-8 text-center border border-neutral-200 hover:border-primary hover:shadow-lg transition-all duration-300"
              >
                <stat.icon className={`w-12 h-12 mx-auto mb-4 ${stat.color}`} />
                <div className="text-3xl lg:text-4xl font-bold text-neutral-900 mb-2">
                  {stat.value}
                </div>
                <div className="text-neutral-600 font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Main Testimonial Carousel */}
          <div className="relative mb-16">
            <div className="max-w-4xl mx-auto">
              {/* Testimonial Card */}
              <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-3xl p-8 lg:p-12 border border-neutral-200">
                <div className="flex flex-col lg:flex-row gap-8 items-center">
                  {/* Profile */}
                  <div className="flex-shrink-0">
                    <img 
                      src={testimonials[currentTestimonial].image} 
                      alt={testimonials[currentTestimonial].name}
                      className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl shadow-lg object-cover"
                    />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 text-center lg:text-left">
                    {/* Rating */}
                    <div className="flex justify-center lg:justify-start gap-1 mb-4">
                      {[...Array(testimonials[currentTestimonial].rating)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-warning text-warning" />
                      ))}
                    </div>
                    
                    {/* Quote */}
                    <Quote className="w-8 h-8 text-primary/20 mb-4 mx-auto lg:mx-0" />
                    <blockquote className="text-lg lg:text-xl text-neutral-700 mb-6 leading-relaxed">
                      {testimonials[currentTestimonial].content}
                    </blockquote>
                    
                    {/* Author Info */}
                    <div className="space-y-2">
                      <div className="font-bold text-neutral-900 text-lg">
                        {testimonials[currentTestimonial].name}
                      </div>
                      <div className="text-neutral-600">
                        {testimonials[currentTestimonial].role} • {testimonials[currentTestimonial].company}
                      </div>
                      
                      {/* Result Badge */}
                      <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full text-sm font-semibold mt-3">
                        <CheckCircle2 className="w-4 h-4" />
                        {testimonials[currentTestimonial].result}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Navigation Arrows */}
              <button 
                onClick={prevTestimonial}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-lg border border-neutral-200 flex items-center justify-center hover:border-primary hover:shadow-xl transition-all duration-300"
              >
                <ChevronLeft className="w-6 h-6 text-neutral-600" />
              </button>
              <button 
                onClick={nextTestimonial}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-lg border border-neutral-200 flex items-center justify-center hover:border-primary hover:shadow-xl transition-all duration-300"
              >
                <ChevronRight className="w-6 h-6 text-neutral-600" />
              </button>
            </div>
            
            {/* Dots Indicator */}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTestimonial(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentTestimonial 
                      ? 'bg-primary w-8' 
                      : 'bg-neutral-300 hover:bg-primary/50'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Secondary Testimonials Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {testimonials.slice(0, 3).map((testimonial, index) => (
              <div 
                key={index}
                className="bg-neutral-50 rounded-2xl p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                {/* Rating */}
                <div className="flex gap-1 mb-3">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                  ))}
                </div>
                
                {/* Content */}
                <blockquote className="text-neutral-700 mb-4 leading-relaxed">
                  "{testimonial.content.substring(0, 120)}..."
                </blockquote>
                
                {/* Author */}
                <div className="flex items-center gap-3">
                  <img 
                    src={testimonial.image} 
                    alt={testimonial.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-semibold text-neutral-900 text-sm">
                      {testimonial.name}
                    </div>
                    <div className="text-neutral-600 text-xs">
                      {testimonial.company}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-primary to-accent p-1 rounded-2xl">
              <div className="bg-white px-8 py-6 rounded-2xl">
                <h3 className="text-2xl font-bold text-neutral-900 mb-3">
                  🎯 Pronto para ter resultados como estes?
                </h3>
                <p className="text-neutral-600 mb-4">
                  Junte-se a +2.847 empresas que estão transformando vendas
                </p>
                <a 
                  href="#signup" 
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-8 py-4 rounded-xl text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                >
                  Começar Minha Transformação
                  <TrendingUp className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
