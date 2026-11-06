/* Matching scalar ABI. It always retains the original musl fma. */
int zero_fma64_qualify(void){return -1;}
int zero_fma64_enabled(void){return 0;}
void zero_fma64_set_enabled(int value){(void)value;}
unsigned int zero_fma64_wrapped_calls(void){return 0;}
