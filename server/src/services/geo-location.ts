import axios from 'axios';

export interface GeoLocation {
  country: string;
  countryCode: string;
  city?: string;
  flag: string;
}

/**
 * يحول رمز الدولة المكون من حرفين إلى علم إيموجي
 */
export function countryCodeToFlag(countryCode: string): string {
  if (!countryCode || countryCode === 'unknown' || countryCode === 'any') {
    return '🌍';
  }
  
  try {
    // تحويل رمز الدولة إلى إيموجي علم
    // للقيام بذلك، نضيف 127397 إلى كل حرف في الرمز (لتحويله إلى مؤشر إقليمي)
    if (/^[a-z]{2}$/i.test(countryCode)) {
      return String.fromCodePoint(
        ...countryCode.toUpperCase().split('').map(c => c.charCodeAt(0) + 127397)
      );
    }
  } catch (error) {
    console.error('Error converting country code to flag:', error);
  }
  
  return '🌍';
}

/**
 * الحصول على بيانات الموقع الجغرافي من IP
 */
export async function getLocationFromIp(ip: string): Promise<GeoLocation | null> {
  // تنظيف IP للتأكد من صحته
  const cleanIp = ip.split(',')[0].trim();
  
  // لا نتجاهل أي IP، حتى المحلية، بل نستخدم الخدمة للحصول على أفضل تحديد ممكن
  
  try {
    // استخدام GeoJS كخدمة رئيسية (حسب طلب المستخدم)
    try {
      const response = await axios.get(`https://get.geojs.io/v1/ip/geo/${cleanIp}.json`, {
        timeout: 5000
      });
      
      if (response.data && response.data.country_code) {
        // تحويل رمز الدولة إلى علم إيموجي
        const flag = countryCodeToFlag(response.data.country_code);
        
        return {
          country: response.data.country || 'Earth',
          countryCode: response.data.country_code?.toLowerCase() || 'unknown',
          city: response.data.city,
          flag
        };
      }
    } catch (error) {
      console.error('GeoJS service failed:', error);
      // تجاهل الخطأ والانتقال إلى الخدمة الاحتياطية
    }
    
    // محاولة ثانية: استخدام IP-API كخدمة احتياطية
    try {
      const response = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,city`, {
        timeout: 3000
      });
      
      if (response.data && response.data.status === 'success') {
        // تحويل رمز الدولة إلى علم إيموجي
        const flag = countryCodeToFlag(response.data.countryCode);
        
        return {
          country: response.data.country || 'Earth',
          countryCode: response.data.countryCode?.toLowerCase() || 'unknown',
          city: response.data.city,
          flag
        };
      }
    } catch (error) {
      console.error('IP-API service failed:', error);
      // تجاهل الخطأ والانتقال إلى الخدمة الاحتياطية التالية
    }
    
    // محاولة ثالثة: استخدام ipinfo.io كخدمة احتياطية أخيرة
    try {
      const response = await axios.get(`https://ipinfo.io/${cleanIp}/json`, {
        timeout: 3000
      });
      
      if (response.data && response.data.country) {
        // تحويل رمز الدولة إلى علم إيموجي
        const flag = countryCodeToFlag(response.data.country);
        
        return {
          country: response.data.country_name || response.data.country || 'Earth',
          countryCode: response.data.country?.toLowerCase() || 'unknown',
          city: response.data.city,
          flag
        };
      }
    } catch (error) {
      console.error('ipinfo.io service failed:', error);
      // تجاهل الخطأ والانتقال إلى القيمة الافتراضية
    }
    
    // إذا كان IP محلياً، حاول الحصول على معلومات البلد من متصفح المستخدم
    if (
      cleanIp === '127.0.0.1' || 
      cleanIp === 'localhost' || 
      cleanIp.startsWith('192.168.') || 
      cleanIp.startsWith('10.') || 
      cleanIp.startsWith('172.16.')
    ) {
      // استخدام خدمة لتحديد الموقع الجغرافي للمستخدم من عنوان IP العام
      try {
        const response = await axios.get('https://get.geojs.io/v1/ip/geo.json', {
          timeout: 3000
        });
        
        if (response.data && response.data.country_code) {
          const flag = countryCodeToFlag(response.data.country_code);
          
          return {
            country: response.data.country || 'Local',
            countryCode: response.data.country_code?.toLowerCase() || 'local',
            city: response.data.city,
            flag
          };
        }
      } catch (error) {
        console.error('Failed to get local user location:', error);
      }
      
      // اذا فشلت كل المحاولات، استخدم قيمة محلية
      return {
        country: 'Local Network',
        countryCode: 'local',
        flag: '🏠'
      };
    }
    
    // في حالة فشل جميع الخدمات، نرجع قيمة افتراضية
    return {
      country: 'Earth',
      countryCode: 'unknown',
      flag: '🌍'
    };
  } catch (error) {
    console.error('Error fetching geo location:', error);
    
    // إرجاع قيمة افتراضية في حالة الفشل
    return {
      country: 'Earth',
      countryCode: 'unknown',
      flag: '🌍'
    };
  }
}

/**
 * الحصول على قائمة بجميع دول العالم مع الأعلام والرموز
 */
export function getAllCountries(): { value: string, label: string, name: string, flag: string }[] {
  // قائمة بأهم الدول مع رموزها وأعلامها
  return [
    { value: 'ae', label: '🇦🇪 United Arab Emirates', name: 'United Arab Emirates', flag: '🇦🇪' },
    { value: 'af', label: '🇦🇫 Afghanistan', name: 'Afghanistan', flag: '🇦🇫' },
    { value: 'al', label: '🇦🇱 Albania', name: 'Albania', flag: '🇦🇱' },
    { value: 'am', label: '🇦🇲 Armenia', name: 'Armenia', flag: '🇦🇲' },
    { value: 'ar', label: '🇦🇷 Argentina', name: 'Argentina', flag: '🇦🇷' },
    { value: 'at', label: '🇦🇹 Austria', name: 'Austria', flag: '🇦🇹' },
    { value: 'au', label: '🇦🇺 Australia', name: 'Australia', flag: '🇦🇺' },
    { value: 'az', label: '🇦🇿 Azerbaijan', name: 'Azerbaijan', flag: '🇦🇿' },
    { value: 'bd', label: '🇧🇩 Bangladesh', name: 'Bangladesh', flag: '🇧🇩' },
    { value: 'be', label: '🇧🇪 Belgium', name: 'Belgium', flag: '🇧🇪' },
    { value: 'bg', label: '🇧🇬 Bulgaria', name: 'Bulgaria', flag: '🇧🇬' },
    { value: 'bh', label: '🇧🇭 Bahrain', name: 'Bahrain', flag: '🇧🇭' },
    { value: 'br', label: '🇧🇷 Brazil', name: 'Brazil', flag: '🇧🇷' },
    { value: 'ca', label: '🇨🇦 Canada', name: 'Canada', flag: '🇨🇦' },
    { value: 'ch', label: '🇨🇭 Switzerland', name: 'Switzerland', flag: '🇨🇭' },
    { value: 'cl', label: '🇨🇱 Chile', name: 'Chile', flag: '🇨🇱' },
    { value: 'cn', label: '🇨🇳 China', name: 'China', flag: '🇨🇳' },
    { value: 'co', label: '🇨🇴 Colombia', name: 'Colombia', flag: '🇨🇴' },
    { value: 'de', label: '🇩🇪 Germany', name: 'Germany', flag: '🇩🇪' },
    { value: 'dk', label: '🇩🇰 Denmark', name: 'Denmark', flag: '🇩🇰' },
    { value: 'eg', label: '🇪🇬 Egypt', name: 'Egypt', flag: '🇪🇬' },
    { value: 'es', label: '🇪🇸 Spain', name: 'Spain', flag: '🇪🇸' },
    { value: 'fi', label: '🇫🇮 Finland', name: 'Finland', flag: '🇫🇮' },
    { value: 'fr', label: '🇫🇷 France', name: 'France', flag: '🇫🇷' },
    { value: 'gb', label: '🇬🇧 United Kingdom', name: 'United Kingdom', flag: '🇬🇧' },
    { value: 'gr', label: '🇬🇷 Greece', name: 'Greece', flag: '🇬🇷' },
    { value: 'hk', label: '🇭🇰 Hong Kong', name: 'Hong Kong', flag: '🇭🇰' },
    { value: 'id', label: '🇮🇩 Indonesia', name: 'Indonesia', flag: '🇮🇩' },
    { value: 'ie', label: '🇮🇪 Ireland', name: 'Ireland', flag: '🇮🇪' },
    { value: 'il', label: '🇮🇱 Israel', name: 'Israel', flag: '🇮🇱' },
    { value: 'in', label: '🇮🇳 India', name: 'India', flag: '🇮🇳' },
    { value: 'iq', label: '🇮🇶 Iraq', name: 'Iraq', flag: '🇮🇶' },
    { value: 'ir', label: '🇮🇷 Iran', name: 'Iran', flag: '🇮🇷' },
    { value: 'it', label: '🇮🇹 Italy', name: 'Italy', flag: '🇮🇹' },
    { value: 'jp', label: '🇯🇵 Japan', name: 'Japan', flag: '🇯🇵' },
    { value: 'jo', label: '🇯🇴 Jordan', name: 'Jordan', flag: '🇯🇴' },
    { value: 'kr', label: '🇰🇷 South Korea', name: 'South Korea', flag: '🇰🇷' },
    { value: 'kw', label: '🇰🇼 Kuwait', name: 'Kuwait', flag: '🇰🇼' },
    { value: 'lb', label: '🇱🇧 Lebanon', name: 'Lebanon', flag: '🇱🇧' },
    { value: 'ly', label: '🇱🇾 Libya', name: 'Libya', flag: '🇱🇾' },
    { value: 'ma', label: '🇲🇦 Morocco', name: 'Morocco', flag: '🇲🇦' },
    { value: 'mx', label: '🇲🇽 Mexico', name: 'Mexico', flag: '🇲🇽' },
    { value: 'my', label: '🇲🇾 Malaysia', name: 'Malaysia', flag: '🇲🇾' },
    { value: 'ng', label: '🇳🇬 Nigeria', name: 'Nigeria', flag: '🇳🇬' },
    { value: 'nl', label: '🇳🇱 Netherlands', name: 'Netherlands', flag: '🇳🇱' },
    { value: 'no', label: '🇳🇴 Norway', name: 'Norway', flag: '🇳🇴' },
    { value: 'nz', label: '🇳🇿 New Zealand', name: 'New Zealand', flag: '🇳🇿' },
    { value: 'om', label: '🇴🇲 Oman', name: 'Oman', flag: '🇴🇲' },
    { value: 'ph', label: '🇵🇭 Philippines', name: 'Philippines', flag: '🇵🇭' },
    { value: 'pk', label: '🇵🇰 Pakistan', name: 'Pakistan', flag: '🇵🇰' },
    { value: 'pl', label: '🇵🇱 Poland', name: 'Poland', flag: '🇵🇱' },
    { value: 'pt', label: '🇵🇹 Portugal', name: 'Portugal', flag: '🇵🇹' },
    { value: 'qa', label: '🇶🇦 Qatar', name: 'Qatar', flag: '🇶🇦' },
    { value: 'ro', label: '🇷🇴 Romania', name: 'Romania', flag: '🇷🇴' },
    { value: 'ru', label: '🇷🇺 Russia', name: 'Russia', flag: '🇷🇺' },
    { value: 'sa', label: '🇸🇦 Saudi Arabia', name: 'Saudi Arabia', flag: '🇸🇦' },
    { value: 'sd', label: '🇸🇩 Sudan', name: 'Sudan', flag: '🇸🇩' },
    { value: 'se', label: '🇸🇪 Sweden', name: 'Sweden', flag: '🇸🇪' },
    { value: 'sg', label: '🇸🇬 Singapore', name: 'Singapore', flag: '🇸🇬' },
    { value: 'sy', label: '🇸🇾 Syria', name: 'Syria', flag: '🇸🇾' },
    { value: 'th', label: '🇹🇭 Thailand', name: 'Thailand', flag: '🇹🇭' },
    { value: 'tn', label: '🇹🇳 Tunisia', name: 'Tunisia', flag: '🇹🇳' },
    { value: 'tr', label: '🇹🇷 Turkey', name: 'Turkey', flag: '🇹🇷' },
    { value: 'tw', label: '🇹🇼 Taiwan', name: 'Taiwan', flag: '🇹🇼' },
    { value: 'ua', label: '🇺🇦 Ukraine', name: 'Ukraine', flag: '🇺🇦' },
    { value: 'us', label: '🇺🇸 United States', name: 'United States', flag: '🇺🇸' },
    { value: 'vn', label: '🇻🇳 Vietnam', name: 'Vietnam', flag: '🇻🇳' },
    { value: 'ye', label: '🇾🇪 Yemen', name: 'Yemen', flag: '🇾🇪' },
    { value: 'za', label: '🇿🇦 South Africa', name: 'South Africa', flag: '🇿🇦' }
  ];
} 