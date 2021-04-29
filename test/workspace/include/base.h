#ifndef BASE_H
#define BASE_H

#include "string.h"


class Base
{
public:
    explicit Base();
    explicit Base(const String &name);
    ~Base();

    String name() const noexcept;
    void setName(const String &name);

    int amount() const noexcept;
    void setAmount(int amount);

    int instances() const noexcept;

private:
    String m_name;
    int m_amount;

    static int m_instances;
};

#endif // BASE_H
